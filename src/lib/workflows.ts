import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workflow } from "./types";
import { substitute, substituteDeep } from "./template";
import { sendEmailAlert } from "./email-alerts";

/**
 * Decides whether a workflow/trigger config fires for a record.
 *
 * `config.when_mode` picks the semantics:
 *   "always" (default) - fires on every save where when_field equals when_value,
 *      so a record sitting at that value re-fires each time it is saved.
 *   "on_change" - fires only when when_field actually changed into when_value
 *      during this save, so a record parked at the value stays quiet.
 *
 * `previous` is the record as it looked before the save: null on create (no
 * prior value, so a matching value counts as a change), or undefined when the
 * caller does not track prior state at all - in which case "on_change" cannot
 * be evaluated and degrades to "always" rather than silently never firing.
 *
 * Custom fields are plain columns on the object's table, so `when_field` reads
 * the same whether it names a built-in field or a custom one.
 */
export function matches(
  config: Record<string, unknown>,
  record: Record<string, unknown>,
  previous?: Record<string, unknown> | null
) {
  const whenField = config.when_field as string | undefined;
  if (!whenField) return true;

  const current = String(record[whenField] ?? "");
  if (current !== String(config.when_value ?? "")) return false;

  if (config.when_mode !== "on_change") return true;
  if (previous === undefined) return true;
  return String(previous?.[whenField] ?? "") !== current;
}

/**
 * Reads a record as it stands right now, for use as the pre-save `previous`
 * passed to runWorkflows. Must be called before the write. Returns null if the
 * record cannot be read, which "on_change" then treats the same as a create.
 */
export async function snapshotRecord(
  supabase: SupabaseClient,
  table: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Runs active workflows for an object after a create/update. Executes
 * field_update and notification synchronously against the same Supabase
 * client (so RLS/session context is respected); external_post/external_get
 * are fired without blocking the caller's response.
 *
 * `previous` is the pre-save record (null on create) and is what makes
 * "on_change" workflows work - see matches().
 */
export async function runWorkflows(
  supabase: SupabaseClient,
  objectName: string,
  record: Record<string, unknown>,
  previous?: Record<string, unknown> | null
) {
  const { data: workflows } = await supabase
    .from("workflows")
    .select("*")
    .eq("object_name", objectName)
    .eq("active", true);

  if (!workflows || workflows.length === 0) return;

  for (const workflow of workflows as Workflow[]) {
    const config = workflow.config || {};
    if (!matches(config, record, previous)) continue;

    if (workflow.trigger_type === "field_update") {
      const setField = config.set_field as string | undefined;
      if (setField) {
        // One code path for built-in and custom fields: both are columns.
        const { error } = await supabase
          .from(objectName)
          .update({ [setField]: config.set_value })
          .eq("id", record.id);
        if (error) {
          console.error(
            `[workflow ${workflow.id}] field_update on "${setField}" failed: ${error.message}`
          );
        }
      }
    } else if (workflow.trigger_type === "notification") {
      const notifyField = (config.notify_user_field as string) || "owner";
      const userId =
        (record[notifyField] as string | undefined) ||
        (record.owner as string | undefined) ||
        (record.related_owner as string | undefined) ||
        (record.created_by as string | undefined);
      if (userId) {
        const { error } = await supabase.from("notifications").insert({
          user_id: userId,
          title: config.title ? substitute(String(config.title), record) : workflow.name,
          body: config.body ? substitute(String(config.body), record) : null,
          object_name: objectName,
          record_id: record.id,
        });
        if (error) {
          // Most often an RLS denial. The notifications INSERT policy admits
          // non-admins only when an active notification workflow targets this
          // object (see supabase/migrations/*_notifications_insert_workflow.sql);
          // if that migration has not been applied, every non-admin lands here.
          console.error(
            `[workflow ${workflow.id}] notification insert failed: ${error.message}`
          );
        }
      } else {
        console.warn(
          `[workflow ${workflow.id}] no recipient: "${notifyField}" is empty on record ${record.id}`
        );
      }
    } else if (workflow.trigger_type === "email_alert") {
      const alertId = config.email_alert_id as string | undefined;
      if (!alertId) {
        console.warn(`[workflow ${workflow.id}] email_alert has no email_alert_id`);
        continue;
      }
      // Awaited, unlike the external_* calls below: an alert that fails should
      // say so in email_log before the request ends, and admins expect the
      // alert to have gone out by the time the save returns.
      const { sent, failed, error } = await sendEmailAlert(alertId, objectName, record);
      if (error) {
        console.error(`[workflow ${workflow.id}] email alert not sent: ${error}`);
      } else if (failed > 0) {
        console.error(
          `[workflow ${workflow.id}] email alert: ${sent} sent, ${failed} failed - see email_log`
        );
      }
    } else if (workflow.trigger_type === "external_post" || workflow.trigger_type === "external_get") {
      const url = config.url as string | undefined;
      if (!url) continue;
      const method = workflow.trigger_type === "external_post" ? "POST" : "GET";
      const headers = (substituteDeep(config.headers ?? {}, record) as Record<string, string>) || {};
      const body = config.body_template ? substituteDeep(config.body_template, record) : undefined;
      try {
        await fetch(substitute(url, record), {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          body: method === "POST" && body ? JSON.stringify(body) : undefined,
        });
      } catch {
        // best-effort; workflow failures should not block the record save
      }
    }
  }
}
