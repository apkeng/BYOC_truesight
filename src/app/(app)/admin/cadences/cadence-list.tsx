"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updateCadence, deleteCadence } from "./actions";
import type { Cadence } from "@/lib/types";

export interface CadenceRow {
  cadence: Cadence;
  stepCount: number;
  triggerCount: number;
  activeEnrollments: number;
}

export function CadenceList({ rows }: { rows: CadenceRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle(c: Cadence, active: boolean) {
    startTransition(async () => {
      const result = await updateCadence(c.id, { name: c.name, description: c.description || "", active });
      if (!result.success) toast.error(result.error || "Failed to update");
      else router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this cadence? Enrolled leads will stop progressing.")) return;
    startTransition(async () => {
      const result = await deleteCadence(id);
      if (!result.success) toast.error(result.error || "Failed to delete");
      else router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Steps</TableHead>
          <TableHead>Triggers</TableHead>
          <TableHead>Active leads</TableHead>
          <TableHead>Active</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No cadences yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map(({ cadence: c, stepCount, triggerCount, activeEnrollments }) => (
          <TableRow key={c.id}>
            <TableCell>
              <Link href={`/admin/cadences/${c.id}`} className="text-primary hover:underline">
                {c.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{stepCount}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{triggerCount}</Badge>
            </TableCell>
            <TableCell>{activeEnrollments}</TableCell>
            <TableCell>
              <Switch checked={c.active} disabled={isPending} onCheckedChange={(v) => toggle(c, v)} />
            </TableCell>
            <TableCell>
              <Button variant="destructive" size="sm" disabled={isPending} onClick={() => remove(c.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
