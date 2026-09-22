"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailAlertRecipientType, EmailAttachment } from "@/lib/types";

const MAX_POSTER_BYTES = 5 * 1024 * 1024;

export async function createEmailTemplate(input: {
  object_name: string;
  name: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("email_templates").insert({
    object_name: input.object_name,
    name: input.name,
    subject: input.subject,
    body: input.body,
    attachments: input.attachments,
    created_by: user?.id ?? null,
  });

  revalidatePath("/admin/email-templates");
  return { success: !error, error: error?.message };
}

export async function updateEmailTemplate(
  id: string,
  input: { name: string; subject: string; body: string; attachments: EmailAttachment[] }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({
      name: input.name,
      subject: input.subject,
      body: input.body,
      attachments: input.attachments,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/email-templates");
  return { success: !error, error: error?.message };
}

export async function deleteEmailTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  revalidatePath("/admin/email-templates");
  return { success: !error, error: error?.message };
}

/** Uploads a poster image to the email-attachments bucket and returns its public URL. Admin-only. */
export async function uploadEmailPoster(
  formData: FormData
): Promise<{ success: boolean; error?: string; url?: string; name?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return { success: false, error: "Forbidden" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided" };
  if (!file.type.startsWith("image/")) return { success: false, error: "Only image files are supported" };
  if (file.size > MAX_POSTER_BYTES) return { success: false, error: "Image must be under 5MB" };

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from("email-attachments").upload(path, file, {
    contentType: file.type,
  });
  if (error) return { success: false, error: error.message };

  const { data } = admin.storage.from("email-attachments").getPublicUrl(path);
  return { success: true, url: data.publicUrl, name: file.name };
}

export interface EmailAlertInput {
  name: string;
  template_id: string | null;
  recipient_type: EmailAlertRecipientType;
  recipient_user_ids: string[];
  active: boolean;
}

export interface EmailAlertResult {
  success: boolean;
  error?: string;
}

/**
 * Email alerts are leads-only, like the templates they send: every template on
 * this page is created with object_name "leads", so an alert can only ever be
 * attached to a workflow on leads.
 */
const ALERT_OBJECT_NAME = "leads";

/** Rejects an alert that could never send, rather than letting it fail silently at save time. */
function validateAlert(input: EmailAlertInput): string | null {
  if (!input.name.trim()) return "Give the alert a name";
  if (!input.template_id) return "Pick an email template";
  if (input.recipient_type === "internal" && input.recipient_user_ids.length === 0) {
    return "Pick at least one internal user to alert";
  }
  return null;
}

export async function createEmailAlert(input: EmailAlertInput): Promise<EmailAlertResult> {
  const invalid = validateAlert(input);
  if (invalid) return { success: false, error: invalid };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("email_alerts").insert({
    name: input.name.trim(),
    object_name: ALERT_OBJECT_NAME,
    template_id: input.template_id,
    recipient_type: input.recipient_type,
    // A lead-recipient alert resolves its address from the record at send time,
    // so any picked users would be dead weight that later reads as a bug.
    recipient_user_ids: input.recipient_type === "internal" ? input.recipient_user_ids : [],
    active: input.active,
    created_by: user?.id ?? null,
  });

  revalidatePath("/admin/email-templates");
  return { success: !error, error: error?.message };
}

export async function updateEmailAlert(
  id: string,
  input: EmailAlertInput
): Promise<EmailAlertResult> {
  const invalid = validateAlert(input);
  if (invalid) return { success: false, error: invalid };

  const supabase = await createClient();
  const { error } = await supabase
    .from("email_alerts")
    .update({
      name: input.name.trim(),
      template_id: input.template_id,
      recipient_type: input.recipient_type,
      recipient_user_ids: input.recipient_type === "internal" ? input.recipient_user_ids : [],
      active: input.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/email-templates");
  return { success: !error, error: error?.message };
}

export async function deleteEmailAlert(id: string): Promise<EmailAlertResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("email_alerts").delete().eq("id", id);
  revalidatePath("/admin/email-templates");
  return { success: !error, error: error?.message };
}
