"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Status = "checking" | "ready" | "invalid";

export default function SetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const supabase = createClient();

    // Supabase's invite/recovery links land here with tokens in the URL hash
    // rather than a `?code=`. @supabase/ssr's auto `detectSessionInUrl` proved
    // unreliable for this hash-based (non-PKCE) form, so parse it and call
    // setSession() explicitly instead of trusting the client to pick it up.
    async function init() {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      const errorDescription = hashParams.get("error_description");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (ignore) return;
        if (error) {
          setLinkError(error.message);
          setStatus("invalid");
        } else {
          window.history.replaceState(null, "", window.location.pathname);
          setStatus("ready");
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (ignore) return;

      if (data.session) {
        setStatus("ready");
      } else {
        setLinkError(
          errorDescription
            ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
            : null
        );
        setStatus("invalid");
      }
    }

    init();
    return () => {
      ignore = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    toast.success("Password set — welcome aboard!");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            {status === "ready"
              ? "Choose a password to activate your account."
              : "Verifying your invite link..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "invalid" && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>
                  {linkError ||
                    "This invite link is invalid or has expired. Ask an admin to send you a new invite."}
                </AlertDescription>
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
                Back to sign in
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={submit} className="space-y-4">
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  minLength={6}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Setting password..." : "Set password & continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
