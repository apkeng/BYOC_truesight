"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runWorkflows, snapshotRecord } from "@/lib/workflows";
import { runRecordTriggeredCadences } from "@/lib/cadences";
import { OBJECTS, type ObjectKey } from "@/lib/objects";

export interface RecordActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Merges custom field values into the row payload.
 *
 * Custom fields are columns on the object's own table, so they are written in
 * the same insert/update as the built-in fields - one round trip, one row, and
 * the saved record already carries them when workflows and cadences read it.
 * `customFieldValues` is keyed by field_name (the column name); the caller has
 * already limited it to fields that exist on this object.
 */
function mergeFields(
  fields: Record<string, unknown>,
  customFieldValues: Record<string, unknown>
): Record<string, unknown> {
  return { ...fields, ...customFieldValues };
}

export async function createRecord(
  objectKey: ObjectKey,
  fields: Record<string, unknown>,
  customFieldValues: Record<string, unknown>
): Promise<RecordActionResult> {
  const def = OBJECTS[objectKey];
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(def.table)
    .insert(mergeFields(fields, customFieldValues))
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Insert failed" };
  }

  const record = data as Record<string, unknown>;
  // null (not undefined): a create genuinely has no prior value, which is what
  // lets an "on_change" workflow treat the initial value as a change.
  await runWorkflows(supabase, def.table, record, null);
  await runRecordTriggeredCadences(supabase, def.table, record, "created");

  revalidatePath(`/${objectKey}`);
  return { success: true, id: data.id };
}

export async function updateRecord(
  objectKey: ObjectKey,
  id: string,
  fields: Record<string, unknown>,
  customFieldValues: Record<string, unknown>
): Promise<RecordActionResult> {
  const def = OBJECTS[objectKey];
  const supabase = await createClient();

  const previous = await snapshotRecord(supabase, def.table, id);

  const { data, error } = await supabase
    .from(def.table)
    .update(mergeFields(fields, customFieldValues))
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Update failed" };
  }

  const record = data as Record<string, unknown>;
  await runWorkflows(supabase, def.table, record, previous);
  await runRecordTriggeredCadences(supabase, def.table, record, "updated");

  revalidatePath(`/${objectKey}`);
  revalidatePath(`/${objectKey}/${id}`);
  return { success: true, id };
}

export async function deleteRecord(
  objectKey: ObjectKey,
  id: string
): Promise<RecordActionResult> {
  const def = OBJECTS[objectKey];
  const supabase = await createClient();

  const { error } = await supabase.from(def.table).delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/${objectKey}`);
  return { success: true };
}

export interface BulkDeleteResult {
  success: boolean;
  error?: string;
  deleted: number;
}

export async function deleteRecords(
  objectKey: ObjectKey,
  ids: string[]
): Promise<BulkDeleteResult> {
  const def = OBJECTS[objectKey];
  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: "No records selected", deleted: 0 };
  }

  const supabase = await createClient();

  const { error, count } = await supabase
    .from(def.table)
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) {
    return { success: false, error: error.message, deleted: 0 };
  }

  revalidatePath(`/${objectKey}`);
  return { success: true, deleted: count ?? ids.length };
}
