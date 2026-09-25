import type { SupabaseClient } from "@supabase/supabase-js";
import { matches } from "./workflows";
import { isScheduleDue } from "./schedule";
import { substitute, substituteDeep } from "./template";
import { getResend, EMAIL_FROM } from "./resend";
import { buildEmailHtml, buildResendAttachments } from "./email-render";
import type { CadenceStep, CadenceTrigger, EmailAttachment, ExternalApiConfig } from "./types";

const RETRY_BACKOFF_MINUTES = 15;

/** Enrolls the given leads into a cadence, skipping any already enrolled (any status). */
export async function enrollLeads(
  supabase: SupabaseClient,
  cadenceId: string,
  leadIds: string[],
  enrolledBy: string | null
): Promise<{ enrolled: number; error?: string }> {
  if (leadIds.length === 0) return { enrolled: 0 };

  const { data: firstStep } = await supabase
    .from("cadence_steps")
    .select("delay_minutes")
    .eq("cadence_id", cadenceId)
    .eq("active", true)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const nextRunAt = new Date(now + (firstStep?.delay_minutes ?? 0) * 60000).toISOString();

  const rows = leadIds.map((leadId) => ({
    cadence_id: cadenceId,
    lead_id: leadId,
    status: "active" as const,
    current_step_order: 0,
    next_run_at: nextRunAt,
    enrolled_by: enrolledBy,
  }));

  const { data, error } = await supabase
    .from("cadence_enrollments")
    .upsert(rows, { onConflict: "cadence_id,lead_id", ignoreDuplicates: true })
    .select("id");

  if (error) {
    // Never swallow this: a failed enrolment is indistinguishable from "nothing
    // matched" to the caller, and that is exactly what makes a cadence look
    // silently broken.
    console.error(`[cadence ${cadenceId}] enrolment failed: ${error.message}`);
    return { enrolled: 0, error: error.message };
  }
  return { enrolled: data?.length ?? 0 };
}

/**
 * Evaluates a trigger's condition against every lead and enrols the matches,
 * skipping leads already enrolled in that cadence (in any status).
 *
 * This is the only bulk-enrolment path: the cron's scheduled triggers and the
 * admin "Enroll matching leads now" button both come through here, so a manual
 * run and a scheduled run always pick the same leads. `config` is the trigger's
 * config - an empty/blank when_field matches every lead, per matches().
 */
export async function enrollMatchingLeads(
  supabase: SupabaseClient,
  cadenceId: string,
  config: Record<string, unknown>
): Promise<{ matched: number; enrolled: number; error?: string }> {
  // select("*") already carries custom fields - they are columns on leads.
  const { data: candidateRecords, error: leadsError } = await supabase.from("leads").select("*");
  if (leadsError) return { matched: 0, enrolled: 0, error: leadsError.message };

  const matchingIds = ((candidateRecords || []) as Record<string, unknown>[])
    .filter((r) => matches(config || {}, r))
    .map((r) => r.id as string);

  if (matchingIds.length === 0) return { matched: 0, enrolled: 0 };

  const { data: existing } = await supabase
    .from("cadence_enrollments")
    .select("lead_id")
    .eq("cadence_id", cadenceId)
    .in("lead_id", matchingIds);
  const already = new Set((existing || []).map((e) => e.lead_id as string));
  const toEnroll = matchingIds.filter((id) => !already.has(id));

  if (toEnroll.length === 0) return { matched: matchingIds.length, enrolled: 0 };

  const { enrolled, error } = await enrollLeads(supabase, cadenceId, toEnroll, null);
  return { matched: matchingIds.length, enrolled, error };
}

/**
 * Auto-enrolls a lead into any active cadence whose record_created/record_updated
 * trigger matches, called from record-actions.ts right after runWorkflows. No-ops
 * for anything other than leads.
 */
export async function runRecordTriggeredCadences(
  supabase: SupabaseClient,
  objectName: string,
  record: Record<string, unknown>,
  changeType: "created" | "updated"
) {
  if (objectName !== "leads") return;
  const triggerType = changeType === "created" ? "record_created" : "record_updated";

  const { data: triggers } = await supabase
    .from("cadence_triggers")
    .select("*")
    .eq("trigger_type", triggerType)
    .eq("object_name", objectName)
    .eq("active", true);

  if (!triggers || triggers.length === 0) return;

  const cadenceIds = [...new Set(triggers.map((t) => t.cadence_id as string))];
  const { data: activeCadences } = await supabase
    .from("cadences")
    .select("id")
    .in("id", cadenceIds)
    .eq("active", true);
  const activeCadenceIds = new Set((activeCadences || []).map((c) => c.id as string));

  for (const trigger of triggers as CadenceTrigger[]) {
    if (!activeCadenceIds.has(trigger.cadence_id)) continue;
    if (!matches(trigger.config || {}, record)) continue;
    await enrollLeads(supabase, trigger.cadence_id, [record.id as string], null);
  }
}

function isScheduledTriggerDue(trigger: CadenceTrigger, now: Date): boolean {
  return isScheduleDue(trigger.config, trigger.last_run_at, now);
}

async function executeStep(
  supabase: SupabaseClient,
  step: CadenceStep,
  lead: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (step.step_type === "email") {
    if (!step.email_template_id) return { success: false, error: "No email template configured" };
    const { data: template } = await supabase
      .from("email_templates")
      .select("*")
      .eq("id", step.email_template_id)
      .single();
    if (!template) return { success: false, error: "Email template not found" };

    const to = (lead.work_email as string) || (lead.personal_email as string);
    if (!to) return { success: false, error: "Lead has no email address" };

    const subject = substitute(template.subject, lead);
    const body = substitute(template.body, lead);
    const attachments = (template.attachments as EmailAttachment[]) || [];

    const resend = getResend();
    let sendError: string | null = null;
    if (!resend) {
      sendError = "Email sending isn't configured yet (missing RESEND_API_KEY).";
    } else {
      const { error } = await resend.emails.send({
        from: EMAIL_FROM,
        to,
        subject,
        text: body,
        html: buildEmailHtml(body, attachments),
        attachments: buildResendAttachments(attachments),
      });
      sendError = error?.message ?? null;
    }

    await supabase.from("email_log").insert({
      template_id: template.id,
      object_name: "leads",
      record_id: lead.id,
      to_email: to,
      subject,
      body,
      sent_by: null,
      status: sendError ? "failed" : "sent",
      error: sendError,
    });

    return sendError ? { success: false, error: sendError } : { success: true };
  }

  if (step.step_type === "external_api") {
    const config = step.external_api_config as ExternalApiConfig | null;
    if (!config?.url) return { success: false, error: "No URL configured" };
    const method = config.method === "GET" ? "GET" : "POST";
    const headers = (substituteDeep(config.headers ?? {}, lead) as Record<string, string>) || {};
    const body = config.body_template ? substituteDeep(config.body_template, lead) : undefined;
    try {
      const res = await fetch(substitute(config.url, lead), {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: method === "POST" && body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Request failed" };
    }
  }

  return { success: false, error: "Unknown step type" };
}

export interface CadenceTickSummary {
  scheduledTriggersRun: number;
  enrolled: number;
  stepsExecuted: number;
  completed: number;
  failed: number;
}

/**
 * The cadence engine's core tick: runs due scheduled triggers, then advances
 * every enrollment whose next_run_at has arrived. Shared by the cron route and
 * the admin "Run cadence engine now" button — always call with a service-role
 * client, since it writes across every user's leads/enrollments/email log
 * regardless of who (or what) kicked off the tick.
 */
export async function tickCadenceEngine(supabase: SupabaseClient): Promise<CadenceTickSummary> {
  const summary: CadenceTickSummary = {
    scheduledTriggersRun: 0,
    enrolled: 0,
    stepsExecuted: 0,
    completed: 0,
    failed: 0,
  };
  const now = new Date();

  const { data: scheduledTriggers } = await supabase
    .from("cadence_triggers")
    .select("*")
    .eq("trigger_type", "scheduled")
    .eq("active", true);

  for (const trigger of (scheduledTriggers || []) as CadenceTrigger[]) {
    if (!isScheduledTriggerDue(trigger, now)) continue;

    const { data: cadence } = await supabase
      .from("cadences")
      .select("active")
      .eq("id", trigger.cadence_id)
      .single();

    if (cadence?.active) {
      const { enrolled } = await enrollMatchingLeads(
        supabase,
        trigger.cadence_id,
        trigger.config || {}
      );
      summary.enrolled += enrolled;
    }

    await supabase
      .from("cadence_triggers")
      .update({ last_run_at: now.toISOString() })
      .eq("id", trigger.id);
    summary.scheduledTriggersRun += 1;
  }

  const { data: dueEnrollments } = await supabase
    .from("cadence_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now.toISOString());

  // Switching a cadence off has to stop the leads already enrolled in it, not
  // just block new enrolments - otherwise an inactive cadence keeps delivering
  // its remaining steps on schedule. Skipped enrolments keep status "active"
  // and their next_run_at, so re-activating the cadence resumes them from the
  // step they had reached rather than dropping them.
  const dueCadenceIds = [
    ...new Set((dueEnrollments || []).map((e) => e.cadence_id as string)),
  ];
  const runnableCadenceIds = new Set<string>();
  if (dueCadenceIds.length > 0) {
    const { data: runnableCadences } = await supabase
      .from("cadences")
      .select("id")
      .in("id", dueCadenceIds)
      .eq("active", true);
    for (const c of runnableCadences || []) runnableCadenceIds.add(c.id as string);
  }

  for (const enrollment of dueEnrollments || []) {
    if (!runnableCadenceIds.has(enrollment.cadence_id as string)) continue;
    const { data: steps } = await supabase
      .from("cadence_steps")
      .select("*")
      .eq("cadence_id", enrollment.cadence_id)
      .eq("active", true)
      .order("step_order", { ascending: true });

    const orderedSteps = (steps || []) as CadenceStep[];
    const step = orderedSteps[enrollment.current_step_order];

    if (!step) {
      await supabase
        .from("cadence_enrollments")
        .update({ status: "completed", completed_at: now.toISOString(), next_run_at: null })
        .eq("id", enrollment.id);
      summary.completed += 1;
      continue;
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", enrollment.lead_id)
      .single();

    if (!lead) {
      await supabase
        .from("cadence_enrollments")
        .update({ status: "removed", next_run_at: null })
        .eq("id", enrollment.id);
      continue;
    }

    const result = await executeStep(supabase, step, lead as Record<string, unknown>);
    await supabase.from("cadence_step_runs").insert({
      enrollment_id: enrollment.id,
      step_id: step.id,
      status: result.success ? "sent" : "failed",
      detail: result.error || null,
    });
    summary.stepsExecuted += 1;

    if (result.success) {
      const nextOrder = enrollment.current_step_order + 1;
      const nextStep = orderedSteps[nextOrder];
      if (nextStep) {
        await supabase
          .from("cadence_enrollments")
          .update({
            current_step_order: nextOrder,
            next_run_at: new Date(now.getTime() + nextStep.delay_minutes * 60000).toISOString(),
          })
          .eq("id", enrollment.id);
      } else {
        await supabase
          .from("cadence_enrollments")
          .update({
            current_step_order: nextOrder,
            status: "completed",
            completed_at: now.toISOString(),
            next_run_at: null,
          })
          .eq("id", enrollment.id);
        summary.completed += 1;
      }
    } else {
      summary.failed += 1;
      await supabase
        .from("cadence_enrollments")
        .update({ next_run_at: new Date(now.getTime() + RETRY_BACKOFF_MINUTES * 60000).toISOString() })
        .eq("id", enrollment.id);
    }
  }

  return summary;
}
