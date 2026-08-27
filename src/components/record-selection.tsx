"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moveLeadsToList } from "@/lib/lead-lists";
import { deleteRecords } from "@/lib/record-actions";
import type { ObjectKey } from "@/lib/objects";

interface SelectionContextValue {
  selected: Set<string>;
  toggle: (id: string) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function RecordRowCheckbox({ id }: { id: string }) {
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  return (
    <Checkbox checked={ctx.selected.has(id)} onCheckedChange={() => ctx.toggle(id)} aria-label="Select row" />
  );
}

export function RecordSelectAllCheckbox({ ids }: { ids: string[] }) {
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  const allSelected = ids.length > 0 && ids.every((id) => ctx.selected.has(id));
  return (
    <Checkbox
      checked={allSelected}
      onCheckedChange={() => ids.forEach((id) => {
        const shouldBeSelected = !allSelected;
        if (ctx.selected.has(id) !== shouldBeSelected) ctx.toggle(id);
      })}
      aria-label="Select all"
    />
  );
}

export function RecordSelectionProvider({
  objectKey,
  objectLabel,
  objectLabelPlural,
  lists,
  children,
}: {
  objectKey: ObjectKey;
  objectLabel: string;
  objectLabelPlural: string;
  lists: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isLeads = objectKey === "leads";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(lists.length > 0 ? "existing" : "new");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [newListName, setNewListName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitMoveToList() {
    if (mode === "new" && !newListName.trim()) {
      toast.error("Enter a name for the new list");
      return;
    }
    if (mode === "existing" && !listId) {
      toast.error("Choose a list");
      return;
    }
    const target = mode === "new" ? { newListName } : { listId };

    startTransition(async () => {
      const result = await moveLeadsToList(Array.from(selected), target);
      if (!result.success) {
        toast.error(result.error || "Could not move leads");
        return;
      }
      toast.success(`Moved ${selected.size} lead${selected.size === 1 ? "" : "s"} to list`);
      setListDialogOpen(false);
      setSelected(new Set());
      setNewListName("");
      router.refresh();
    });
  }

  function submitDelete() {
    const toDelete = Array.from(selected);
    startDeleteTransition(async () => {
      const result = await deleteRecords(objectKey, toDelete);
      setDeleteDialogOpen(false);
      if (!result.success) {
        toast.error(result.error || "Delete failed");
        return;
      }
      toast.success(
        `${result.deleted} ${result.deleted === 1 ? objectLabel.toLowerCase() : objectLabelPlural.toLowerCase()} deleted`
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <SelectionContext.Provider value={{ selected, toggle }}>
      {children}

      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-md">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            {isLeads && (
              <Button size="sm" onClick={() => setListDialogOpen(true)}>
                Move to List
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {isLeads && (
        <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move to list</DialogTitle>
              <DialogDescription>
                Add {selected.size} selected lead{selected.size === 1 ? "" : "s"} to a list.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === "existing" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("existing")}
                  disabled={lists.length === 0}
                >
                  Existing list
                </Button>
                <Button type="button" variant={mode === "new" ? "default" : "outline"} size="sm" onClick={() => setMode("new")}>
                  New list
                </Button>
              </div>

              {mode === "existing" ? (
                lists.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You don&apos;t have any lists yet. Create one instead.
                  </p>
                ) : (
                  <Select value={listId} onValueChange={(v) => v && setListId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) => lists.find((l) => l.id === v)?.name || "Choose a list"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lists.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="new_list_name">List name</Label>
                  <Input
                    id="new_list_name"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. Follow up this week"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button onClick={submitMoveToList} disabled={isPending}>
                {isPending ? "Moving..." : "Move"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} {selected.size === 1 ? objectLabel.toLowerCase() : objectLabelPlural.toLowerCase()}?
            </DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={submitDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SelectionContext.Provider>
  );
}
