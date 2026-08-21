import { createAdminClient } from "@/lib/supabase/admin";
import { signIn, signUpFirstAdmin } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const admin = createAdminClient();
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true });
  const isFirstTimeSetup = !count || count === 0;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Build Your Own CRM</CardTitle>
          <CardDescription>
            {isFirstTimeSetup
              ? "No users yet — create the first account to become admin."
              : "Sign in to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{decodeURIComponent(error)}</AlertDescription>
            </Alert>
          )}
          {isFirstTimeSetup ? (
            <form action={signUpFirstAdmin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" name="full_name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" minLength={6} required />
              </div>
              <Button type="submit" className="w-full">
                Create admin account
              </Button>
            </form>
          ) : (
            <form action={signIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              <Button type="submit" className="w-full">
                Sign in
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                No account? Ask an admin to invite you from the Admin panel.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
