"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

export async function signUpFirstAdmin(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "");

  const admin = createAdminClient();

  // Re-check server-side (not just trusting the UI) that this is genuinely
  // the bootstrap case before creating a pre-confirmed account — the
  // handle_new_user DB trigger only grants 'admin' to the very first row
  // in `profiles`, so this is only ever a real admin if the table is empty.
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (count && count > 0) {
    redirect(`/login?error=${encodeURIComponent("Setup already complete — ask an admin to invite you.")}`);
  }

  // Supabase requires email confirmation by default, which would strand this
  // bootstrap flow with no way to receive the confirmation email. Create the
  // account pre-confirmed via the service-role client instead of the public
  // sign-up call, then sign in normally to establish the session.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    redirect(`/login?error=${encodeURIComponent(createError.message)}`);
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`);
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
