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
    lookup_object: input.field_type === "lookup" ? input.lookup_object : null,
  });

  if (!error && input.field_type === "picklist" && input.picklist_values?.length) {
    await supabase.from("picklist_values").insert(
      input.picklist_values.map((value, i) => ({
        object_name: input.object_name,
        field_name: input.field_name,
        value,
        is_default: i === 0,
        sort_order: i + 1,
      }))
    );
  }

  revalidatePath("/admin/custom-fields");
  revalidatePath("/admin/picklists");
  return { success: !error, error: error?.message };
}

export async function deleteCustomField(id: string) {
  const supabase = await createClient();
  const { data: field } = await supabase
    .from("custom_fields")
    .select("object_name, field_name")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("custom_fields").delete().eq("id", id);

  if (!error && field) {
    await supabase
      .from("picklist_values")
      .delete()
      .eq("object_name", field.object_name)
      .eq("field_name", field.field_name);
  }

  revalidatePath("/admin/custom-fields");
  revalidatePath("/admin/picklists");
  return { success: !error, error: error?.message };
}
