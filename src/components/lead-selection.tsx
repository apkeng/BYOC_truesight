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

interface SelectionContextValue {
  selected: Set<string>;
  toggle: (id: string) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function LeadRowCheckbox({ id }: { id: string }) {
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  return (
    <Checkbox checked={ctx.selected.has(id)} onCheckedChange={() => ctx.toggle(id)} aria-label="Select lead" />
  );
}

export function LeadSelectAllCheckbox({ ids }: { ids: string[] }) {
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

export function LeadSelectionProvider({
  lists,
  children,
}: {
  lists: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(lists.length > 0 ? "existing" : "new");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [newListName, setNewListName] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
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
      setDialogOpen(false);
      setSelected(new Set());
      setNewListName("");
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
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              Move to List
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SelectionContext.Provider>
  );
}
