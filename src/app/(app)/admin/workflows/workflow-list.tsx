"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  toggleWorkflowActive,
  deleteWorkflow,
  cloneWorkflow,
  runScheduledWorkflowsNow,
} from "./actions";
import { OBJECTS } from "@/lib/objects";
import { describeSchedule } from "@/lib/schedule";
import { WHEN_OPERATOR_LABELS } from "@/lib/types";
import type { Workflow, WorkflowWhenOperator } from "@/lib/types";

/** Plain-English version of a workflow's when_* condition, for the table. */
function describeCondition(config: Record<string, unknown> | null | undefined): string {
  const c = config || {};
  const field = c.when_field as string | undefined;
  if (!field) return "every record";

  const raw = c.when_operator;
  const operator: WorkflowWhenOperator =
    raw === "not_equals" || raw === "is_blank" || raw === "is_not_blank" ? raw : "equals";
  const label = WHEN_OPERATOR_LABELS[operator];

  if (operator === "is_blank" || operator === "is_not_blank") return `${field} ${label}`;
  return `${field} ${label} "${String(c.when_value ?? "")}"`;
}

export function WorkflowList({
  workflows,
  editingId,
  onEdit,
}: {
  workflows: Workflow[];
  editingId?: string | null;
  onEdit: (workflow: Workflow) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasScheduled = workflows.some((w) => w.run_mode === "scheduled" && w.active);

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const result = await toggleWorkflowActive(id, active);
      if (!result.success) toast.error(result.error || "Failed to update");
      else router.refresh();
    });
  }

  function duplicate(id: string) {
    startTransition(async () => {
      const result = await cloneWorkflow(id);
      if (!result.success) toast.error(result.error || "Failed to clone");
      else {
        toast.success("Workflow cloned — the copy is switched off until you turn it on");
        router.refresh();
      }
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

  function runScheduled() {
    startTransition(async () => {
      const result = await runScheduledWorkflowsNow();
      if (!result.success) {
        toast.error(result.error || "Failed to run");
        return;
      }
      const s = result.summary!;
      if (s.workflowsRun === 0) {
        toast.info("No scheduled workflow is due right now");
      } else {
        toast.success(
          `Ran ${s.workflowsRun} workflow(s): ${s.recordsMatched} records matched, ${s.actionsRun} actions run, ${s.failed} failed`
        );
      }
      if (s.capped.length > 0) {
        toast.warning(`Too many matches, only the first 500 were acted on: ${s.capped.join(", ")}`);
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <p className="text-xs text-muted-foreground">
          Scheduled workflows run on the cron every 15 minutes. Use this to run every due one now.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || !hasScheduled}
          onClick={runScheduled}
        >
          Run scheduled now
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Object</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Runs</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead>Active</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workflows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No workflows yet.
              </TableCell>
            </TableRow>
          )}
          {workflows.map((w) => (
            <TableRow key={w.id} data-state={w.id === editingId ? "selected" : undefined}>
              <TableCell>{w.name}</TableCell>
              <TableCell>
                {OBJECTS[w.object_name as keyof typeof OBJECTS]?.labelPlural || w.object_name}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{w.trigger_type}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {w.run_mode === "scheduled" ? (
                  <>
                    <div>{describeSchedule(w.schedule_config)}</div>
                    <div>
                      last run: {w.last_run_at ? new Date(w.last_run_at).toLocaleString() : "never"}
                    </div>
                  </>
                ) : !w.config?.when_field ? (
                  "on every save"
                ) : w.config.when_mode === "on_change" ? (
                  "on save, when it changes"
                ) : (
                  "on save, while matching"
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {describeCondition(w.config)}
              </TableCell>
              <TableCell>
                <Switch checked={w.active} disabled={isPending} onCheckedChange={(v) => toggle(w.id, v)} />
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onEdit(w)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => duplicate(w.id)}
                  >
                    Clone
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isPending}
                    onClick={() => remove(w.id)}
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
