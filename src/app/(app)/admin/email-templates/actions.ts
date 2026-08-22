"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createEmailTemplate(input: {
  object_name: string;
  name: string;
  subject: string;
  body: string;
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
    created_by: user?.id ?? null,
  });

  revalidatePath("/admin/email-templates");
  return { success: !error, error: error?.message };
}

export async function updateEmailTemplate(
  id: string,
  input: { name: string; subject: string; body: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_templates")
    .update({
      name: input.name,
      subject: input.subject,
      body: input.body,
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
