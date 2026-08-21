"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toggleWorkflowActive, deleteWorkflow } from "./actions";
import { OBJECTS } from "@/lib/objects";
import type { Workflow } from "@/lib/types";

export function WorkflowList({ workflows }: { workflows: Workflow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const result = await toggleWorkflowActive(id, active);
      if (!result.success) toast.error(result.error || "Failed to update");
      else router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this workflow?")) return;
    startTransition(async () => {
      const result = await deleteWorkflow(id);
      if (!result.success) toast.error(result.error || "Failed to delete");
      else router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Object</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Active</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {workflows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No workflows yet.
            </TableCell>
          </TableRow>
        )}
        {workflows.map((w) => (
          <TableRow key={w.id}>
            <TableCell>{w.name}</TableCell>
            <TableCell>{OBJECTS[w.object_name as keyof typeof OBJECTS]?.labelPlural || w.object_name}</TableCell>
            <TableCell>
              <Badge variant="secondary">{w.trigger_type}</Badge>
            </TableCell>
            <TableCell>
              <Switch checked={w.active} disabled={isPending} onCheckedChange={(v) => toggle(w.id, v)} />
            </TableCell>
            <TableCell>
              <Button variant="destructive" size="sm" disabled={isPending} onClick={() => remove(w.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
