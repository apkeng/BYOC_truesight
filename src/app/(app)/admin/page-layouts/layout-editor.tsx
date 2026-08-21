"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { savePageLayout } from "./actions";
import { OBJECTS, type ObjectKey } from "@/lib/objects";

export function LayoutEditor({
  objectName,
  initialOrder,
}: {
  objectName: ObjectKey;
  initialOrder: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState(initialOrder);
  const def = OBJECTS[objectName];

  function move(index: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await savePageLayout(objectName, order);
      if (!result.success) toast.error(result.error || "Failed to save");
      else {
        toast.success("Layout saved");
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-md space-y-2">
      {order.map((fieldName, i) => {
        const field = def.fields.find((f) => f.name === fieldName);
        return (
          <div key={fieldName} className="flex items-center justify-between rounded border px-3 py-2">
            <span className="text-sm">{field?.label || fieldName}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
              >
                <ArrowDown className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button onClick={save} disabled={isPending} className="mt-2">
        {isPending ? "Saving..." : "Save layout"}
      </Button>
    </div>
  );
}
