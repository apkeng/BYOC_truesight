"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteRecord } from "@/lib/record-actions";
import type { ObjectKey } from "@/lib/objects";

export function DeleteRecordButton({
  objectKey,
  id,
  label,
}: {
  objectKey: ObjectKey;
  id: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteRecord(objectKey, id);
      if (!result.success) {
        toast.error(result.error || "Delete failed");
        return;
      }
      toast.success(`${label} deleted`);
      router.push(`/${objectKey}`);
      router.refresh();
    });
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
      {isPending ? "Deleting..." : "Delete"}
    </Button>
  );
}
