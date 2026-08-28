"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { removeLeadsFromList } from "@/lib/lead-lists";
import { SendToCadenceDialog } from "./send-to-cadence-dialog";

export interface ListMemberRow {
  leadId: string;
  name: string;
  email: string;
  organization: string;
}

export function ListMembersTable({ listId, rows }: { listId: string; rows: ListMemberRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cadenceDialogOpen, setCadenceDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const ids = useMemo(() => rows.map((r) => r.leadId), [rows]);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ids));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRemove() {
    const toRemove = Array.from(selected);
    startTransition(async () => {
      const result = await removeLeadsFromList(listId, toRemove);
      if (!result.success) {
        toast.error(result.error || "Failed to remove");
        return;
      }
      toast.success(`${toRemove.length} removed from list`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCadenceDialogOpen(true)}>
              Send to cadence
            </Button>
            <Button variant="outline" size="sm" disabled={isPending} onClick={handleRemove}>
              Remove from list
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 w-10 pl-4">
                <Checkbox checked={allSelected} disabled={ids.length === 0} onCheckedChange={toggleAll} aria-label="Select all" />
              </TableHead>
              <TableHead className="h-11 text-xs font-medium tracking-wider text-muted-foreground uppercase">Name</TableHead>
              <TableHead className="h-11 text-xs font-medium tracking-wider text-muted-foreground uppercase">Email</TableHead>
              <TableHead className="h-11 text-xs font-medium tracking-wider text-muted-foreground uppercase">Organization</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No leads in this list yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.leadId}>
                <TableCell className="py-3 pl-4">
                  <Checkbox checked={selected.has(row.leadId)} onCheckedChange={() => toggleOne(row.leadId)} aria-label="Select row" />
                </TableCell>
                <TableCell className="py-3">
                  <Link href={`/leads/${row.leadId}`} className="font-medium text-foreground hover:underline">
                    {row.name || "(untitled)"}
                  </Link>
                </TableCell>
                <TableCell className="py-3 text-muted-foreground">{row.email}</TableCell>
                <TableCell className="py-3 text-muted-foreground">{row.organization}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SendToCadenceDialog
        open={cadenceDialogOpen}
        onOpenChange={setCadenceDialogOpen}
        leadIds={Array.from(selected)}
        onDone={() => {
          setSelected(new Set());
          router.refresh();
        }}
      />
    </div>
  );
}
