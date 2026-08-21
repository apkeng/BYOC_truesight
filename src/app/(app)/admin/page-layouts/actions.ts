"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function savePageLayout(objectName: string, layout: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("page_layouts")
    .upsert(
      { object_name: objectName, layout, updated_at: new Date().toISOString() },
      { onConflict: "object_name" }
    );
  revalidatePath("/admin/page-layouts");
  return { success: !error, error: error?.message };
}
