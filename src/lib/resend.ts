import { Resend } from "resend";

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export const EMAIL_FROM = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
