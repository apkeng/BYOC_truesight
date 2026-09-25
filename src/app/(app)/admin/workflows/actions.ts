"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  tickScheduledWorkflows,
  type ScheduledWorkflowSummary,
} from "@/lib/scheduled-workflows";
import type { Workflow, WorkflowRunMode, WorkflowTriggerType } from "@/lib/types";

export async function createWorkflow(input: {
  name: string;
  object_name: string;
  trigger_type: WorkflowTriggerType;
  config: Record<string, unknown>;
  run_mode: WorkflowRunMode;
  schedule_config: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").insert({
    name: input.name,
    object_name: input.object_name,
    trigger_type: input.trigger_type,
    config: input.config,
    run_mode: input.run_mode,
    schedule_config: input.run_mode === "scheduled" ? input.schedule_config : {},
    active: true,
  });
  revalidatePath("/admin/workflows");
  return { success: !error, error: error?.message };
}

/**
 * Saves edits to an existing workflow. active and last_run_at are left alone:
 * the list's switch owns active, and rewriting last_run_at would make a
 * scheduled workflow fire again (or skip a run) just because it was edited.
 */
export async function updateWorkflow(
  id: string,
  input: {
    name: string;
    object_name: string;
    trigger_type: WorkflowTriggerType;
    config: Record<string, unknown>;
    run_mode: WorkflowRunMode;
    schedule_config: Record<string, unknown>;
  }
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflows")
    .update({
      name: input.name,
      object_name: input.object_name,
      trigger_type: input.trigger_type,
      config: input.config,
      run_mode: input.run_mode,
      schedule_config: input.run_mode === "scheduled" ? input.schedule_config : {},
    })
    .eq("id", id)
    .select("id");
  revalidatePath("/admin/workflows");
  if (error) return { success: false, error: error.message };
  // RLS turns a forbidden update into zero rows rather than an error
  if (!data || data.length === 0) return { success: false, error: "Workflow not found" };
  return { success: true };
}

export async function toggleWorkflowActive(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").update({ active }).eq("id", id);
  revalidatePath("/admin/workflows");
  return { success: !error, error: error?.message };
}

/**
 * Duplicates a workflow, switched off.
 *
 * Inactive on purpose: a clone exists to be edited, and a second copy of a
 * live workflow that starts firing the moment it is created would double every
 * notification and email the original sends. last_run_at is deliberately not
 * copied either - the clone has never run, and inheriting the original's
 * timestamp would make a scheduled clone skip its first due window.
 */
export async function cloneWorkflow(id: string) {
  const supabase = await createClient();

  const { data: original, error: readError } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { success: false, error: readError.message };
  if (!original) return { success: false, error: "Workflow not found" };

  const source = original as Workflow;
  const { error } = await supabase.from("workflows").insert({
    name: `${source.name} (copy)`,
    object_name: source.object_name,
    trigger_type: source.trigger_type,
    config: source.config,
    run_mode: source.run_mode ?? "on_save",
    schedule_config: source.schedule_config ?? {},
    active: false,
  });

  revalidatePath("/admin/workflows");
  return { success: !error, error: error?.message };
}

export async function deleteWorkflow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  revalidatePath("/admin/workflows");
  return { success: !error, error: error?.message };
}

/**
 * Runs every due scheduled workflow right now, the same sweep the cron does.
 *
 * Admin-gated and service-role, mirroring runCadenceEngineNow: the sweep writes
 * across every user's records and sends mail on their behalf, which RLS refuses
 * for the signed-in user's own client.
 */
export async function runScheduledWorkflowsNow(): Promise<{
  success: boolean;
  error?: string;
  summary?: ScheduledWorkflowSummary;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return { success: false, error: "Forbidden" };

  const summary = await tickScheduledWorkflows(createAdminClient());
  revalidatePath("/admin/workflows");
  return { success: true, summary };
}
