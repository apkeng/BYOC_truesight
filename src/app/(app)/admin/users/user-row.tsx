"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfileRole } from "./actions";
import { ResetPasswordDialog } from "./reset-password-dialog";
import type { Profile, UserRole } from "@/lib/types";

export function UserRow({ profile }: { profile: Profile }) {
  const [isPending, startTransition] = useTransition();

  function changeRole(role: UserRole) {
    startTransition(async () => {
      const result = await updateProfileRole(profile.id, role);
      if (result.success) toast.success("Role updated");
      else toast.error(result.error || "Failed to update role");
    });
  }

  return (
    <TableRow>
      <TableCell>{profile.full_name || "—"}</TableCell>
      <TableCell>{profile.email}</TableCell>
      <TableCell>
        <Select
          value={profile.role}
          onValueChange={(v) => v && changeRole(v as UserRole)}
          disabled={isPending}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">sales</SelectItem>
            <SelectItem value="admin">admin</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <ResetPasswordDialog profile={profile} />
      </TableCell>
    </TableRow>
  );
}
