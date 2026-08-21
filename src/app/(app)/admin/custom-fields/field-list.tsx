"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCustomField } from "./actions";
import type { CustomField } from "@/lib/types";

export function FieldList({ fields }: { fields: CustomField[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove(id: string) {
    if (!confirm("Delete this custom field and all its values?")) return;
    startTransition(async () => {
      const result = await deleteCustomField(id);
      if (!result.success) toast.error(result.error || "Delete failed");
      else {
        toast.success("Field deleted");
        router.refresh();
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead>Field name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-muted-foreground">
              No custom fields yet.
            </TableCell>
          </TableRow>
        )}
        {fields.map((f) => (
          <TableRow key={f.id}>
            <TableCell>{f.field_label}</TableCell>
            <TableCell className="font-mono text-xs">{f.field_name}</TableCell>
            <TableCell>{f.field_type}</TableCell>
            <TableCell>
              <Button variant="destructive" size="sm" disabled={isPending} onClick={() => remove(f.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
