import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserRow } from "./user-row";
import { InviteForm } from "./invite-form";
import type { Profile } from "@/lib/types";

export default async function UsersAdminPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Users</h1>
      <InviteForm />
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Password</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {((profiles as Profile[]) || []).map((p) => (
              <UserRow key={p.id} profile={p} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
