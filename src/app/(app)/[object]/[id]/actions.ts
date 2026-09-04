"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getResend, EMAIL_FROM } from "@/lib/resend";
import { buildEmailHtml, buildResendAttachments } from "@/lib/email-render";
import type { EmailAttachment } from "@/lib/types";

export async function sendLeadEmail(input: {
  leadId: string;
  templateId: string | null;
  to: string;
  subject: string;
  body: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  let attachments: EmailAttachment[] = [];
  if (input.templateId) {
    const { data: template } = await supabase
      .from("email_templates")
      .select("attachments")
      .eq("id", input.templateId)
      .single();
    attachments = (template?.attachments as EmailAttachment[]) || [];
  }

  const resend = getResend();
  if (!resend) {
    return {
      success: false,
      error: "Email sending isn't configured yet (missing RESEND_API_KEY).",
    };
  }

  const { error: sendError } = await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.body,
    html: buildEmailHtml(input.body, attachments),
    attachments: buildResendAttachments(attachments),
    replyTo: profile?.email || undefined,
  });

  await supabase.from("email_log").insert({
    template_id: input.templateId,
    object_name: "leads",
    record_id: input.leadId,
    to_email: input.to,
    subject: input.subject,
    body: input.body,
    sent_by: user.id,
    status: sendError ? "failed" : "sent",
    error: sendError?.message ?? null,
  });

  revalidatePath(`/leads/${input.leadId}`);

  if (sendError) return { success: false, error: sendError.message };
  return { success: true };
}
