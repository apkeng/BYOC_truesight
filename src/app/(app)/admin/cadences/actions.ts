"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollMatchingLeads, tickCadenceEngine, type CadenceTickSummary } from "@/lib/cadences";
import type { CadenceStepType, CadenceTriggerType, ExternalApiConfig } from "@/lib/types";

export interface ActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function createCadence(input: { name: string; description: string }): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cadences")
    .insert({ name: input.name, description: input.description || null })
    .select("id")
    .single();
  revalidatePath("/admin/cadences");
  return { success: !error, id: data?.id, error: error?.message };
}

export async function updateCadence(
  id: string,
  input: { name: string; description: string; active: boolean }
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cadences")
    .update({
      name: input.name,
      description: input.description || null,
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/admin/cadences");
  revalidatePath(`/admin/cadences/${id}`);
  return { success: !error, error: error?.message };
}

export async function deleteCadence(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("cadences").delete().eq("id", id);
  revalidatePath("/admin/cadences");
  return { success: !error, error: error?.message };
}

export interface StepInput {
  step_type: CadenceStepType;
  delay_minutes: number;
  email_template_id: string | null;
  external_api_config: ExternalApiConfig | null;
}

export async function saveCadenceSteps(cadenceId: string, steps: StepInput[]): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: deleteError } = await supabase.from("cadence_steps").delete().eq("cadence_id", cadenceId);
  if (deleteError) return { success: false, error: deleteError.message };

  if (steps.length > 0) {
    const rows = steps.map((s, i) => ({
      cadence_id: cadenceId,
      step_order: i,
      step_type: s.step_type,
      delay_minutes: s.delay_minutes,
      email_template_id: s.step_type === "email" ? s.email_template_id : null,
      external_api_config: s.step_type === "external_api" ? s.external_api_config : null,
    }));
    const { error } = await supabase.from("cadence_steps").insert(rows);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath(`/admin/cadences/${cadenceId}`);
  return { success: true };
}

export interface TriggerInput {
  trigger_type: CadenceTriggerType;
  config: Record<string, unknown>;
  active: boolean;
}

export async function saveCadenceTriggers(cadenceId: string, triggers: TriggerInput[]): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: deleteError } = await supabase.from("cadence_triggers").delete().eq("cadence_id", cadenceId);
  if (deleteError) return { success: false, error: deleteError.message };

  if (triggers.length > 0) {
    const rows = triggers.map((t) => ({
      cadence_id: cadenceId,
      trigger_type: t.trigger_type,
      object_name: "leads",
      config: t.config,
      active: t.active,
    }));
    const { error } = await supabase.from("cadence_triggers").insert(rows);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath(`/admin/cadences/${cadenceId}`);
  return { success: true };
}

/** Shared admin gate for the actions below, which run with a service-role client. */
async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Unauthorized";

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return "Forbidden";
  return null;
}

export async function runCadenceEngineNow(): Promise<
  ActionResult & { summary?: CadenceTickSummary }
> {
  const denied = await requireAdmin();
  if (denied) return { success: false, error: denied };

  const summary = await tickCadenceEngine(createAdminClient());
  revalidatePath("/admin/cadences");
  return { success: true, summary };
}

/**
 * Enrolls every lead currently matching a trigger's condition, whatever the
 * trigger's type.
 *
 * record_created/record_updated triggers only ever fire on a lead's own
 * save, and a scheduled trigger waits for its next due time, so neither
 * touches the leads already sitting in the CRM when the cadence is set up.
 * This is the explicit "apply this trigger to the leads I already have"
 * action - deliberately a button rather than something the engine does on
 * its own, since a blank condition matches every lead.
 */
export async function enrollMatchingLeadsNow(
  cadenceId: string,
  config: Record<string, unknown>
): Promise<ActionResult & { matched?: number; enrolled?: number }> {
  const denied = await requireAdmin();
  if (denied) return { success: false, error: denied };

  const admin = createAdminClient();
  const { data: cadence } = await admin
    .from("cadences")
    .select("active")
    .eq("id", cadenceId)
    .maybeSingle();
  if (!cadence) return { success: false, error: "Cadence not found" };
  if (!cadence.active) {
    return { success: false, error: "Turn the cadence on before enrolling leads into it" };
  }

  const { data: steps } = await admin
    .from("cadence_steps")
    .select("id")
    .eq("cadence_id", cadenceId)
    .eq("active", true)
    .limit(1);
  if (!steps || steps.length === 0) {
    return { success: false, error: "Add at least one step before enrolling leads" };
  }

  const { matched, enrolled, error } = await enrollMatchingLeads(admin, cadenceId, config || {});
  if (error) return { success: false, error };

  revalidatePath(`/admin/cadences/${cadenceId}`);
  return { success: true, matched, enrolled };
}
