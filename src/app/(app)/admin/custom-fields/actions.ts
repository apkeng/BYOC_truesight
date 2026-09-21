"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates a custom field. The field's values live in a real column on the
 * object's table, so creating one is a schema change: `create_custom_field`
 * adds the column and writes the catalog row in a single transaction, under an
 * admin check (see supabase/migrations/*_custom_fields_as_columns.sql). Nothing
 * here can reach ALTER TABLE on its own — the anon-key session the server
 * client carries has no DDL rights.
 */
export async function createCustomField(input: {
  object_name: string;
  field_name: string;
  field_label: string;
  field_type: "number" | "text" | "picklist" | "lookup";
  picklist_values?: string[];
  lookup_object?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_custom_field", {
    p_object_name: input.object_name,
    p_field_name: input.field_name,
    p_field_label: input.field_label,
    p_field_type: input.field_type,
    p_picklist_values: null,
    p_lookup_object: input.field_type === "lookup" ? input.lookup_object ?? null : null,
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

/** Drops the field's column along with its catalog row — the values go with it. */
export async function deleteCustomField(id: string) {
  const supabase = await createClient();
  const { data: field } = await supabase
    .from("custom_fields")
    .select("object_name, field_name")
    .eq("id", id)
    .single();

  const { error } = await supabase.rpc("delete_custom_field", { p_id: id });

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
