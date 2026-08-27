"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runWorkflows } from "@/lib/workflows";
import { OBJECTS, type ObjectKey } from "@/lib/objects";

export interface RecordActionResult {
  success: boolean;
  id?: string;
  error?: string;
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
    .insert(fields)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Insert failed" };
  }

  await saveCustomFieldValues(objectKey, data.id, customFieldValues);
  await runWorkflows(supabase, def.table, data);

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

  const { data, error } = await supabase
    .from(def.table)
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Update failed" };
  }

  await saveCustomFieldValues(objectKey, id, customFieldValues);
  await runWorkflows(supabase, def.table, data);

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

export async function saveCustomFieldValues(
  objectKey: ObjectKey,
  recordId: string,
  values: Record<string, unknown>
) {
  const entries = Object.entries(values);
  if (entries.length === 0) return;

  const supabase = await createClient();

  for (const [customFieldId, rawValue] of entries) {
    const { data: field } = await supabase
      .from("custom_fields")
      .select("*")
      .eq("id", customFieldId)
      .single();
    if (!field) continue;

    const payload: Record<string, unknown> = {
      custom_field_id: customFieldId,
      record_id: recordId,
      value_text: null,
      value_number: null,
      value_lookup: null,
      updated_at: new Date().toISOString(),
    };

    if (field.field_type === "number") {
      payload.value_number = rawValue === "" || rawValue == null ? null : Number(rawValue);
    } else if (field.field_type === "lookup") {
      payload.value_lookup = rawValue || null;
    } else {
      payload.value_text = rawValue == null ? null : String(rawValue);
    }

    await supabase
      .from("custom_field_values")
      .upsert(payload, { onConflict: "custom_field_id,record_id" });
  }
}
