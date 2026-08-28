"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getActiveCadencesForPicker, enrollLeadsInCadence } from "@/lib/lead-lists";

export function SendToCadenceDialog({
  open,
  onOpenChange,
  leadIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
  onDone: () => void;
}) {
  const [cadences, setCadences] = useState<{ id: string; name: string }[]>([]);
  const [cadenceId, setCadenceId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) getActiveCadencesForPicker().then(setCadences);
  }, [open]);

  function submit() {
    if (!cadenceId) {
      toast.error("Choose a cadence");
      return;
    }
    startTransition(async () => {
      const result = await enrollLeadsInCadence(cadenceId, leadIds);
      if (!result.success) {
        toast.error(result.error || "Failed to enroll");
        return;
      }
      toast.success(`${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} sent to cadence`);
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {leadIds.length} lead{leadIds.length === 1 ? "" : "s"} to cadence</DialogTitle>
          <DialogDescription>
            Each lead starts at step 1. Leads already enrolled in the chosen cadence are skipped.
          </DialogDescription>
        </DialogHeader>

        {cadences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active cadences yet — create one under Admin → Cadences.
          </p>
        ) : (
          <Select value={cadenceId ?? undefined} onValueChange={setCadenceId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a cadence" />
            </SelectTrigger>
            <SelectContent>
              {cadences.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || cadences.length === 0}>
            {isPending ? "Sending..." : "Send to cadence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
