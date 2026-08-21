"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowTriggerType } from "@/lib/types";

export async function createWorkflow(input: {
  name: string;
  object_name: string;
  trigger_type: WorkflowTriggerType;
  config: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").insert({
    name: input.name,
    object_name: input.object_name,
    trigger_type: input.trigger_type,
    config: input.config,
    active: true,
  });
  revalidatePath("/admin/workflows");
  return { success: !error, error: error?.message };
}

export async function toggleWorkflowActive(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").update({ active }).eq("id", id);
  revalidatePath("/admin/workflows");
  return { success: !error, error: error?.message };
}

export async function deleteWorkflow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  revalidatePath("/admin/workflows");
  return { success: !error, error: error?.message };
}
