import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workflow } from "./types";
import { substitute, substituteDeep } from "./template";

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
 * Reads a record (custom fields merged) as it stands right now, for use as the
 * pre-save `previous` passed to runWorkflows. Must be called before the write.
 * Returns null if the record cannot be read, which "on_change" then treats the
 * same as a create.
 */
export async function snapshotRecord(
  supabase: SupabaseClient,
  table: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const [enriched] = await withCustomFields(supabase, table, [data]);
  return enriched ?? null;
}

/** Looks up a custom field by name for an object, or null if it is a base column. */
async function findCustomField(
  supabase: SupabaseClient,
  objectName: string,
  fieldName: string
): Promise<{ id: string; field_type: string } | null> {
  const { data } = await supabase
    .from("custom_fields")
    .select("id, field_type")
    .eq("object_name", objectName)
    .eq("field_name", fieldName)
    .maybeSingle();
  return (data as { id: string; field_type: string } | null) ?? null;
}

/** Maps a raw value onto the right custom_field_values column for its type. */
function customValuePayload(fieldType: string, raw: unknown) {
  return {
    value_text: fieldType === "number" || fieldType === "lookup" ? null : raw == null ? null : String(raw),
    value_number: fieldType === "number" ? (raw === "" || raw == null ? null : Number(raw)) : null,
    value_lookup: fieldType === "lookup" ? raw || null : null,
  };
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
        const custom = await findCustomField(supabase, objectName, setField);
        const { error } = custom
          ? await supabase.from("custom_field_values").upsert(
              {
                custom_field_id: custom.id,
                record_id: record.id,
                ...customValuePayload(custom.field_type, config.set_value),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "custom_field_id,record_id" }
            )
          : await supabase
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
