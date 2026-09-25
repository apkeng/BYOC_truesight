import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workflow, WorkflowWhenOperator } from "./types";
import { substitute, substituteDeep } from "./template";
import { sendEmailAlert } from "./email-alerts";

/**
 * "Has this field been filled in?" - the test behind the is_blank /
 * is_not_blank operators.
 *
 * Empty string, whitespace-only and an empty array all count as blank, because
 * all three are what an untouched field actually looks like in this CRM: text
 * inputs submit "", and a tags field submits []. The number 0 and the string
 * "false" are NOT blank - they are values somebody chose.
 */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/** Falls back to "equals" for any config written before operators existed. */
function readOperator(config: Record<string, unknown>): WorkflowWhenOperator {
  const raw = config.when_operator;
  return raw === "not_equals" || raw === "is_blank" || raw === "is_not_blank" ? raw : "equals";
}

/**
 * Whether one record satisfies a condition, ignoring when_mode entirely.
 * A config with no when_field matches everything, which is what makes a blank
 * cadence trigger enroll every lead.
 */
function conditionHolds(
  config: Record<string, unknown>,
  record: Record<string, unknown>
): boolean {
  const whenField = config.when_field as string | undefined;
  if (!whenField) return true;

  const value = record[whenField];
  const operator = readOperator(config);
  if (operator === "is_blank") return isBlank(value);
  if (operator === "is_not_blank") return !isBlank(value);

  const equal = String(value ?? "") === String(config.when_value ?? "");
  return operator === "not_equals" ? !equal : equal;
}

/**
 * Decides whether a workflow/trigger config fires for a record.
 *
 * `config.when_operator` picks the comparison against when_field:
 *   "equals" (default) / "not_equals" - compared against when_value
 *   "is_blank" / "is_not_blank"       - when_value is ignored
 * Omitting it means "equals", so every workflow and cadence trigger written
 * before operators existed keeps behaving exactly as it did.
 *
 * `config.when_mode` picks when it fires:
 *   "always" (default) - fires on every save where the condition holds, so a
 *      record already in that state re-fires each time it is saved.
 *   "on_change" - fires only on the save that moved the record INTO the
 *      condition, so a record parked there stays quiet.
 *
 * `previous` is the record as it looked before the save: null on create (there
 * was no prior state, so a match counts as a change), or undefined when the
 * caller does not track prior state at all - in which case "on_change" cannot
 * be evaluated and degrades to "always" rather than silently never firing.
 * The scheduled-workflow engine is the "undefined" caller: it sweeps records at
 * a due time rather than watching saves, so it has no before-picture to compare.
 *
 * Custom fields are plain columns on the object's table, so `when_field` reads
 * the same whether it names a built-in field or a custom one.
 */
export function matches(
  config: Record<string, unknown>,
  record: Record<string, unknown>,
  previous?: Record<string, unknown> | null
) {
  if (!conditionHolds(config, record)) return false;

  if (config.when_mode !== "on_change") return true;
  if (!config.when_field) return true;
  if (previous === undefined) return true;
  if (previous === null) return true;
  return !conditionHolds(config, previous);
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
 * Performs one workflow's action on one record, with the condition already
 * judged to hold. Split out of runWorkflows so the scheduled engine
 * (src/lib/scheduled-workflows.ts) runs the identical action code - an
 * "email alert" has to mean the same thing whether a save or a schedule
 * fired it.
 *
 * Never throws: a workflow action must not take down the record save that
 * triggered it, nor abandon the rest of a scheduled sweep. Problems come back
 * as { ok: false, error } and are logged here.
 */
export async function runWorkflowAction(
  supabase: SupabaseClient,
  workflow: Workflow,
  objectName: string,
  record: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const config = workflow.config || {};

  function fail(message: string, level: "error" | "warn" = "error") {
    const line = `[workflow ${workflow.id}] ${message}`;
    if (level === "warn") console.warn(line);
    else console.error(line);
    return { ok: false, error: message };
  }

  if (workflow.trigger_type === "field_update") {
    const setField = config.set_field as string | undefined;
    if (!setField) return fail("field_update has no set_field", "warn");
    // One code path for built-in and custom fields: both are columns.
    const { error } = await supabase
      .from(objectName)
      .update({ [setField]: config.set_value })
      .eq("id", record.id);
    if (error) return fail(`field_update on "${setField}" failed: ${error.message}`);
    return { ok: true };
  }

  if (workflow.trigger_type === "notification") {
    const notifyField = (config.notify_user_field as string) || "owner";
    const userId =
      (record[notifyField] as string | undefined) ||
      (record.owner as string | undefined) ||
      (record.related_owner as string | undefined) ||
      (record.created_by as string | undefined);
    if (!userId) {
      return fail(`no recipient: "${notifyField}" is empty on record ${record.id}`, "warn");
    }
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
      // The scheduled engine runs service-role, so it never hits this.
      return fail(`notification insert failed: ${error.message}`);
    }
    return { ok: true };
  }

  if (workflow.trigger_type === "email_alert") {
    const alertId = config.email_alert_id as string | undefined;
    if (!alertId) return fail("email_alert has no email_alert_id", "warn");
    // Awaited, unlike the external_* calls below: an alert that fails should
    // say so in email_log before the request ends, and admins expect the
    // alert to have gone out by the time the save returns.
    const { sent, failed, error } = await sendEmailAlert(alertId, objectName, record);
    if (error) return fail(`email alert not sent: ${error}`);
    if (failed > 0) {
      return fail(`email alert: ${sent} sent, ${failed} failed - see email_log`);
    }
    return { ok: true };
  }

  if (workflow.trigger_type === "external_post" || workflow.trigger_type === "external_get") {
    const url = config.url as string | undefined;
    if (!url) return fail("external call has no url", "warn");
    const method = workflow.trigger_type === "external_post" ? "POST" : "GET";
    const headers = (substituteDeep(config.headers ?? {}, record) as Record<string, string>) || {};
    const body = config.body_template ? substituteDeep(config.body_template, record) : undefined;
    try {
      await fetch(substitute(url, record), {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: method === "POST" && body ? JSON.stringify(body) : undefined,
      });
      return { ok: true };
    } catch (err) {
      // best-effort; workflow failures should not block the record save
      return fail(err instanceof Error ? err.message : "external call failed");
    }
  }

  return fail(`unknown trigger type "${workflow.trigger_type}"`, "warn");
}

/**
 * Runs active workflows for an object after a create/update, against the same
 * Supabase client as the save (so RLS/session context is respected).
 *
 * Only run_mode = "on_save" workflows are considered. Scheduled ones are swept
 * by tickScheduledWorkflows on the cron instead, and must not also fire here -
 * that would make a "daily at 09:00" workflow fire on every edit as well.
 * run_mode is absent on rows written before the column existed, which reads as
 * on_save, matching how those workflows already behaved.
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
    if (workflow.run_mode === "scheduled") continue;
    if (!matches(workflow.config || {}, record, previous)) continue;
    await runWorkflowAction(supabase, workflow, objectName, record);
  }
}
