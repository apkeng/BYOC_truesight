"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setFieldPermission(input: {
  object_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("field_permissions").upsert(
    {
      role: "sales",
      object_name: input.object_name,
      field_name: input.field_name,
      can_view: input.can_view,
      can_edit: input.can_edit,
    },
    { onConflict: "role,object_name,field_name" }
  );
  revalidatePath("/admin/field-permissions");
  return { success: !error, error: error?.message };
}
