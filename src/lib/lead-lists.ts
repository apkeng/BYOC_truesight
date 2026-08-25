"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface LeadListActionResult {
  success: boolean;
  error?: string;
  listId?: string;
}

export async function moveLeadsToList(
  leadIds: string[],
  target: { listId: string } | { newListName: string }
): Promise<LeadListActionResult> {
  if (leadIds.length === 0) return { success: false, error: "No leads selected" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  let listId: string;
  if ("newListName" in target) {
    const name = target.newListName.trim();
    if (!name) return { success: false, error: "List name is required" };
    const { data, error } = await supabase
      .from("lead_lists")
      .insert({ name, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) return { success: false, error: error?.message || "Could not create list" };
    listId = data.id;
  } else {
    listId = target.listId;
  }

  const rows = leadIds.map((lead_id) => ({ list_id: listId, lead_id }));
  const { error: memberError } = await supabase
    .from("lead_list_members")
    .upsert(rows, { onConflict: "list_id,lead_id", ignoreDuplicates: true });
  if (memberError) return { success: false, error: memberError.message };

  revalidatePath("/lead-lists");
  return { success: true, listId };
}

export async function deleteLeadList(listId: string): Promise<LeadListActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("lead_lists").delete().eq("id", listId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/lead-lists");
  return { success: true };
}
