"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setFieldPermission } from "./actions";
import type { FieldDef } from "@/lib/objects";
import type { FieldPermission } from "@/lib/types";

export function PermissionMatrix({
  objectName,
  fields,
  permissions,
}: {
  objectName: string;
  fields: FieldDef[];
  permissions: FieldPermission[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const wildcard = permissions.find((p) => p.field_name === "*");

  function effective(fieldName: string) {
    const specific = permissions.find((p) => p.field_name === fieldName);
    if (specific) return { can_view: specific.can_view, can_edit: specific.can_edit };
    return {
      can_view: wildcard?.can_view ?? true,
      can_edit: wildcard?.can_edit ?? false,
    };
  }

  function update(fieldName: string, patch: Partial<{ can_view: boolean; can_edit: boolean }>) {
    const current = effective(fieldName);
    startTransition(async () => {
      const result = await setFieldPermission({
        object_name: objectName,
        field_name: fieldName,
        can_view: patch.can_view ?? current.can_view,
        can_edit: patch.can_edit ?? current.can_edit,
      });
      if (!result.success) toast.error(result.error || "Failed to update");
      else router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field (sales role)</TableHead>
          <TableHead>Can view</TableHead>
          <TableHead>Can edit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields
          .filter((f) => !f.type.startsWith("readonly"))
          .map((f) => {
            const eff = effective(f.name);
            return (
              <TableRow key={f.name}>
                <TableCell>{f.label}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={eff.can_view}
                    disabled={isPending}
                    onCheckedChange={(v) => update(f.name, { can_view: !!v })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={eff.can_edit}
                    disabled={isPending}
                    onCheckedChange={(v) => update(f.name, { can_edit: !!v })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
