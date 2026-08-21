"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCustomField(input: {
  object_name: string;
  field_name: string;
  field_label: string;
  field_type: "number" | "text" | "picklist" | "lookup";
  picklist_values?: string[];
  lookup_object?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("custom_fields").insert({
    object_name: input.object_name,
    field_name: input.field_name,
    field_label: input.field_label,
    field_type: input.field_type,
    picklist_values: input.field_type === "picklist" ? input.picklist_values : null,
    lookup_object: input.field_type === "lookup" ? input.lookup_object : null,
  });
  revalidatePath("/admin/custom-fields");
  return { success: !error, error: error?.message };
}

export async function deleteCustomField(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("custom_fields").delete().eq("id", id);
  revalidatePath("/admin/custom-fields");
  return { success: !error, error: error?.message };
}
