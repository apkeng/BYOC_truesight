import type { SupabaseClient } from "@supabase/supabase-js";
import { matches, runWorkflowAction } from "./workflows";
import { isScheduleDue } from "./schedule";
import { SCHEDULABLE_TRIGGER_TYPES } from "./types";
import type { Workflow } from "./types";

/**
 * Most records one scheduled workflow will touch in a single due run.
 *
 * A scheduled workflow with a blank condition matches every record on the
 * object, so without a ceiling one misconfigured "email alert" workflow would
 * try to mail the entire database from a cron tick. Hitting the cap is
 * reported in the summary and logged rather than swallowed.
 */
const MAX_RECORDS_PER_RUN = 500;

export interface ScheduledWorkflowSummary {
  /** Workflows that were due and ran this tick. */
  workflowsRun: number;
  /** Records that matched a due workflow's condition. */
  recordsMatched: number;
  /** Actions attempted (one per matched record). */
  actionsRun: number;
  failed: number;
  /** Names of workflows whose match set was truncated by MAX_RECORDS_PER_RUN. */
  capped: string[];
  /** Matches skipped because a lead-facing alert already reached them. */
  skippedAlreadySent: number;
}

/**
 * For a lead-facing email alert: ids of records whose lead already has a
 * successful send of this alert's template in email_log. Returns null when
 * the workflow isn't a lead-facing alert, so no dedupe applies.
 *
 * Throws if email_log can't be read. Sending blind would re-mail everyone, so
 * the caller skips the run instead.
 */
async function alreadySentRecordIds(
  supabase: SupabaseClient,
  workflow: Workflow
): Promise<Set<string> | null> {
  if (workflow.trigger_type !== "email_alert") return null;
  const alertId = (workflow.config || {}).email_alert_id as string | undefined;
  if (!alertId) return null;

  const { data: alert, error: alertError } = await supabase
    .from("email_alerts")
    .select("recipient_type, template_id")
    .eq("id", alertId)
    .maybeSingle();
  if (alertError) throw new Error(`could not read email alert: ${alertError.message}`);
  if (!alert || alert.recipient_type !== "lead" || !alert.template_id) return null;

  const ids = new Set<string>();
  const PAGE = 1000; // PostgREST's default row cap; page past it explicitly.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("email_log")
      .select("record_id")
      .eq("template_id", alert.template_id)
      .eq("object_name", workflow.object_name)
      .eq("status", "sent")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`could not read email_log: ${error.message}`);
    for (const row of data || []) ids.add(row.record_id as string);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

/**
 * The scheduled-workflow engine's tick: finds active scheduled workflows whose
 * schedule has come due, sweeps every record on their object, and runs the
 * workflow's action on each one that matches the condition.
 *
 * Always call with a service-role client. The sweep reads and writes across
 * every user's records, inserts notifications for other people, and sends email
 * alerts - all of which RLS refuses for an ordinary user, the same trap that
 * made workflow notifications silently dead for non-admins before
 * 20260916000000_notifications_insert_workflow.sql.
 *
 * Every due run acts on every current match, with one exception: a lead-facing
 * email alert skips records whose lead already has a successful send of that
 * template in email_log. Without that, a daily "webinar invite" alert re-mailed
 * every matching lead each day. Failed sends (quota, bad address) are retried
 * on the next run. field_update is idempotent, and notifications and
 * internal-recipient alerts still repeat, because for those "tell me again
 * while this is still true" is the point of a schedule.
 */
export async function tickScheduledWorkflows(
  supabase: SupabaseClient
): Promise<ScheduledWorkflowSummary> {
  const summary: ScheduledWorkflowSummary = {
    workflowsRun: 0,
    recordsMatched: 0,
    actionsRun: 0,
    failed: 0,
    capped: [],
    skippedAlreadySent: 0,
  };
  const now = new Date();

  const { data: workflows, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("run_mode", "scheduled")
    .eq("active", true);

  if (error) {
    // Almost always "column workflows.run_mode does not exist" - i.e. the
    // migration has not been applied to this database yet. Say so plainly
    // instead of reporting a quiet zero-work tick.
    console.error(`[scheduled workflows] could not load workflows: ${error.message}`);
    return summary;
  }
  if (!workflows || workflows.length === 0) return summary;

  for (const workflow of workflows as Workflow[]) {
    if (!isScheduleDue(workflow.schedule_config, workflow.last_run_at ?? null, now)) continue;

    if (!SCHEDULABLE_TRIGGER_TYPES.includes(workflow.trigger_type)) {
      console.warn(
        `[scheduled workflow ${workflow.id}] trigger type "${workflow.trigger_type}" cannot be scheduled - skipped`
      );
      continue;
    }

    // Claimed before the work, not after: the actions below send real email,
    // and a crash halfway through must not leave the workflow due again on the
    // next tick a minute later, re-mailing everyone it already reached.
    const { error: claimError } = await supabase
      .from("workflows")
      .update({ last_run_at: now.toISOString() })
      .eq("id", workflow.id);
    if (claimError) {
      console.error(
        `[scheduled workflow ${workflow.id}] could not claim run: ${claimError.message}`
      );
      continue;
    }
    summary.workflowsRun += 1;

    // select("*") already carries custom fields - they are columns on the table.
    const { data: records, error: recordsError } = await supabase
      .from(workflow.object_name)
      .select("*");
    if (recordsError) {
      console.error(
        `[scheduled workflow ${workflow.id}] could not read ${workflow.object_name}: ${recordsError.message}`
      );
      continue;
    }

    // No `previous` argument: a sweep has no before-picture, so a condition
    // left on when_mode "on_change" degrades to "always" here (see matches()).
    const allMatching = ((records || []) as Record<string, unknown>[]).filter((r) =>
      matches(workflow.config || {}, r)
    );
    summary.recordsMatched += allMatching.length;

    let alreadySent: Set<string> | null;
    try {
      alreadySent = await alreadySentRecordIds(supabase, workflow);
    } catch (err) {
      console.error(
        `[scheduled workflow ${workflow.id}] skipped, can't tell who was already emailed: ${
          err instanceof Error ? err.message : err
        }`
      );
      continue;
    }
    // Filtered before the cap, so a match set over MAX_RECORDS_PER_RUN works
    // through in chunks across runs instead of re-sending the same first 500.
    const matching = alreadySent
      ? allMatching.filter((r) => !alreadySent.has(r.id as string))
      : allMatching;
    summary.skippedAlreadySent += allMatching.length - matching.length;

    const batch = matching.slice(0, MAX_RECORDS_PER_RUN);
    if (matching.length > batch.length) {
      summary.capped.push(workflow.name);
      console.warn(
        `[scheduled workflow ${workflow.id}] ${matching.length} records matched; acting on the first ${MAX_RECORDS_PER_RUN}. Narrow the condition.`
      );
    }

    for (const record of batch) {
      const result = await runWorkflowAction(supabase, workflow, workflow.object_name, record);
      summary.actionsRun += 1;
      if (!result.ok) summary.failed += 1;
    }
  }

  return summary;
}
