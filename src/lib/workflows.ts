import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workflow } from "./types";
import { substitute, substituteDeep } from "./template";

export function matches(config: Record<string, unknown>, record: Record<string, unknown>) {
  const whenField = config.when_field as string | undefined;
  if (!whenField) return true;
  return String(record[whenField] ?? "") === String(config.when_value ?? "");
}

/**
 * Merges each record's custom field values (by field_name) onto the record
 * object, so matches()/substitute() can reference custom fields the same way
 * they reference built-in columns. Custom field values live in a separate
 * custom_field_values table (keyed by custom_field_id, not field_name), so
 * without this, config.when_field pointing at a custom field would always
 * read as undefined off the raw table row.
 */
export async function withCustomFields(
  supabase: SupabaseClient,
  objectName: string,
  records: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (records.length === 0) return records;

  const { data: fields } = await supabase
    .from("custom_fields")
    .select("id, field_name, field_type")
    .eq("object_name", objectName);
  if (!fields || fields.length === 0) return records;

  const { data: values } = await supabase
    .from("custom_field_values")
    .select("*")
    .in("record_id", records.map((r) => r.id as string))
    .in("custom_field_id", fields.map((f) => f.id as string));

  const fieldById = new Map(fields.map((f) => [f.id as string, f]));
  const byRecordId = new Map<string, Record<string, unknown>>();
  for (const row of values || []) {
    const field = fieldById.get(row.custom_field_id as string);
    if (!field) continue;
    const bucket = byRecordId.get(row.record_id as string) ?? {};
    bucket[field.field_name as string] =
      field.field_type === "number"
        ? row.value_number
        : field.field_type === "lookup"
        ? row.value_lookup
        : row.value_text;
    byRecordId.set(row.record_id as string, bucket);
  }

  return records.map((r) => ({ ...r, ...(byRecordId.get(r.id as string) ?? {}) }));
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
