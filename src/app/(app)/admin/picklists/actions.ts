"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addPicklistValue(input: {
  object_name: string;
  field_name: string;
  value: string;
  is_default: boolean;
}) {
  const supabase = await createClient();

  if (input.is_default) {
    await supabase
      .from("picklist_values")
      .update({ is_default: false })
      .eq("object_name", input.object_name)
      .eq("field_name", input.field_name);
  }

  const { count } = await supabase
    .from("picklist_values")
    .select("id", { count: "exact", head: true })
    .eq("object_name", input.object_name)
    .eq("field_name", input.field_name);

  const { error } = await supabase.from("picklist_values").insert({
    object_name: input.object_name,
    field_name: input.field_name,
    value: input.value,
    is_default: input.is_default,
    sort_order: (count || 0) + 1,
  });

  revalidatePath("/admin/picklists");
  return { success: !error, error: error?.message };
}

export async function deletePicklistValue(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("picklist_values").delete().eq("id", id);
  revalidatePath("/admin/picklists");
  return { success: !error, error: error?.message };
}

export async function setDefaultPicklistValue(id: string, objectName: string, fieldName: string) {
  const supabase = await createClient();
  await supabase
    .from("picklist_values")
    .update({ is_default: false })
    .eq("object_name", objectName)
    .eq("field_name", fieldName);
  const { error } = await supabase.from("picklist_values").update({ is_default: true }).eq("id", id);
  revalidatePath("/admin/picklists");
  return { success: !error, error: error?.message };
}
