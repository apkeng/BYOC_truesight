"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteLeadList } from "@/lib/lead-lists";

export function DeleteLeadListButton({ listId, name }: { listId: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete the list "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteLeadList(listId);
      if (!result.success) {
        toast.error(result.error || "Delete failed");
        return;
      }
      toast.success("List deleted");
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      onClick={handleDelete}
      disabled={isPending}
    >
      {isPending ? "Deleting..." : "Delete"}
    </Button>
  );
}
