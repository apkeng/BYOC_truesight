import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workflow } from "./types";
import { substitute, substituteDeep } from "./template";

export function matches(config: Record<string, unknown>, record: Record<string, unknown>) {
  const whenField = config.when_field as string | undefined;
  if (!whenField) return true;
  return String(record[whenField] ?? "") === String(config.when_value ?? "");
}

/**
 * Runs active workflows for an object after a create/update. Executes
 * field_update and notification synchronously against the same Supabase
 * client (so RLS/session context is respected); external_post/external_get
 * are fired without blocking the caller's response.
 */
export async function runWorkflows(
  supabase: SupabaseClient,
  objectName: string,
  record: Record<string, unknown>
) {
  const { data: workflows } = await supabase
    .from("workflows")
    .select("*")
    .eq("object_name", objectName)
    .eq("active", true);

  if (!workflows || workflows.length === 0) return;

  for (const workflow of workflows as Workflow[]) {
    const config = workflow.config || {};
    if (!matches(config, record)) continue;

    if (workflow.trigger_type === "field_update") {
      const setField = config.set_field as string | undefined;
      if (setField) {
        await supabase
          .from(objectName)
          .update({ [setField]: config.set_value })
          .eq("id", record.id);
      }
    } else if (workflow.trigger_type === "notification") {
      const notifyField = (config.notify_user_field as string) || "owner";
      const userId =
        (record[notifyField] as string | undefined) ||
        (record.owner as string | undefined) ||
        (record.related_owner as string | undefined) ||
        (record.created_by as string | undefined);
      if (userId) {
        await supabase.from("notifications").insert({
          user_id: userId,
          title: config.title ? substitute(String(config.title), record) : workflow.name,
          body: config.body ? substitute(String(config.body), record) : null,
          object_name: objectName,
          record_id: record.id,
        });
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
