import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { substitute } from "./template";
import { getResend, EMAIL_FROM } from "./resend";
import { buildEmailHtml, buildResendAttachments } from "./email-render";
import type { EmailAlert, EmailAttachment, EmailTemplate } from "./types";

export interface EmailAlertResult {
  sent: number;
  failed: number;
  /** Set when the alert could not be attempted at all (no template, no recipients). */
  error?: string;
}

/**
 * Resolves an alert's recipient addresses.
 *
 * "lead" reads the record the workflow fired on, mirroring the cadence engine's
 * work-then-personal preference. "internal" reads the hand-picked profiles;
 * ids whose profile has since been deleted are simply skipped rather than
 * failing the whole alert.
 */
async function resolveRecipients(
  admin: ReturnType<typeof createAdminClient>,
  alert: EmailAlert,
  record: Record<string, unknown>
): Promise<string[]> {
  if (alert.recipient_type === "lead") {
    const to = (record.work_email as string) || (record.personal_email as string);
    return to ? [to] : [];
  }

  const ids = alert.recipient_user_ids || [];
  if (ids.length === 0) return [];
  const { data: profiles } = await admin.from("profiles").select("email").in("id", ids);
  return (profiles || []).map((p) => p.email as string).filter(Boolean);
}

/**
 * Sends one email alert for a record.
 *
 * Runs on a service-role client, not the client of whoever saved the record.
 * An alert has to read other users' profiles and write an email_log row with
 * sent_by = null, and both are refused by RLS for an ordinary user - the same
 * trap that made workflow notifications silently dead for non-admins before
 * 20260916000000_notifications_insert_workflow.sql. Sending is a system action,
 * so it gets a system client.
 *
 * Never throws: a workflow action must not block the record save that triggered
 * it. Failures land in email_log with the reason, and in the server log.
 */
export async function sendEmailAlert(
  alertId: string,
  objectName: string,
  record: Record<string, unknown>
): Promise<EmailAlertResult> {
  const admin = createAdminClient();

  const { data: alertRow } = await admin
    .from("email_alerts")
    .select("*")
    .eq("id", alertId)
    .eq("active", true)
    .maybeSingle();

  const alert = alertRow as EmailAlert | null;
  if (!alert) return { sent: 0, failed: 0, error: "Email alert not found or inactive" };

  // An alert built for leads must not fire on, say, an organization: its
  // template's merge fields would all render blank.
  if (alert.object_name !== objectName) {
    return {
      sent: 0,
      failed: 0,
      error: `Alert "${alert.name}" is for ${alert.object_name}, not ${objectName}`,
    };
  }

  if (!alert.template_id) {
    return { sent: 0, failed: 0, error: `Alert "${alert.name}" has no email template` };
  }

  const { data: templateRow } = await admin
    .from("email_templates")
    .select("*")
    .eq("id", alert.template_id)
    .maybeSingle();
  const template = templateRow as EmailTemplate | null;
  if (!template) return { sent: 0, failed: 0, error: "Email template not found" };

  const recipients = await resolveRecipients(admin, alert, record);
  if (recipients.length === 0) {
    return { sent: 0, failed: 0, error: `Alert "${alert.name}" resolved to no recipients` };
  }

  // Merge fields always come from the record the workflow fired on, for both
  // audiences - an internal alert is *about* that record ("{{name}} reached
  // Hot"), so it wants the same substitutions a lead-facing one does.
  const subject = substitute(template.subject, record);
  const body = substitute(template.body, record);
  const attachments = (template.attachments as EmailAttachment[]) || [];
  const html = buildEmailHtml(body, attachments);
  const resendAttachments = buildResendAttachments(attachments);

  const resend = getResend();
  const result: EmailAlertResult = { sent: 0, failed: 0 };

  for (const to of recipients) {
    let sendError: string | null = null;
    if (!resend) {
      sendError = "Email sending isn't configured yet (missing RESEND_API_KEY).";
    } else {
      try {
        const { error } = await resend.emails.send({
          from: EMAIL_FROM,
          to,
          subject,
          text: body,
          html,
          attachments: resendAttachments,
        });
        sendError = error?.message ?? null;
      } catch (err) {
        sendError = err instanceof Error ? err.message : "Send failed";
      }
    }

    // Logged against the record that triggered the alert for both audiences -
    // email_log.record_id is NOT NULL, and "which record caused this" is the
    // useful thing to look up either way.
    await admin.from("email_log").insert({
      template_id: template.id,
      object_name: objectName,
      record_id: record.id,
      to_email: to,
      subject,
      body,
      sent_by: null,
      status: sendError ? "failed" : "sent",
      error: sendError,
    });

    if (sendError) {
      result.failed += 1;
      console.error(`[email alert ${alert.id}] send to ${to} failed: ${sendError}`);
    } else {
      result.sent += 1;
    }
  }

  return result;
}
