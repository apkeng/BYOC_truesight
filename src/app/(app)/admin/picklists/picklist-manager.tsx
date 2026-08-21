"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addPicklistValue, deletePicklistValue, setDefaultPicklistValue } from "./actions";
import type { PicklistValue } from "@/lib/types";

export function PicklistManager({
  objectName,
  picklistFieldNames,
  values,
}: {
  objectName: string;
  picklistFieldNames: string[];
  values: PicklistValue[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldName, setFieldName] = useState(picklistFieldNames[0] || "");
  const [newValue, setNewValue] = useState("");

  const grouped: Record<string, PicklistValue[]> = {};
  for (const v of values) {
    grouped[v.field_name] = grouped[v.field_name] || [];
    grouped[v.field_name].push(v);
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!fieldName || !newValue) return;
    startTransition(async () => {
      const result = await addPicklistValue({
        object_name: objectName,
        field_name: fieldName,
        value: newValue,
        is_default: false,
      });
      if (!result.success) toast.error(result.error || "Failed to add value");
      else {
        toast.success("Value added");
        setNewValue("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePicklistValue(id);
      if (!result.success) toast.error(result.error || "Failed to delete");
      else router.refresh();
    });
  }

  function setDefault(id: string, fName: string) {
    startTransition(async () => {
      const result = await setDefaultPicklistValue(id, objectName, fName);
      if (!result.success) toast.error(result.error || "Failed to set default");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <form onSubmit={add} className="flex items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm">Field</label>
          <Select value={fieldName} onValueChange={(v) => v && setFieldName(v)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {picklistFieldNames.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm">New value</label>
          <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        </div>
        <Button type="submit" disabled={isPending}>
          Add
        </Button>
      </form>

      {picklistFieldNames.map((fName) => (
        <div key={fName}>
          <h3 className="mb-2 text-sm font-medium">{fName}</h3>
          <div className="flex flex-wrap gap-2">
            {(grouped[fName] || []).map((v) => (
              <Badge
                key={v.id}
                variant={v.is_default ? "default" : "secondary"}
                className="cursor-pointer gap-2 py-1.5"
              >
                <span onClick={() => setDefault(v.id, fName)}>
                  {v.value} {v.is_default && "★"}
                </span>
                <button onClick={() => remove(v.id)} className="opacity-70 hover:opacity-100">
                  ×
                </button>
              </Badge>
            ))}
            {(grouped[fName] || []).length === 0 && (
              <span className="text-sm text-muted-foreground">No values yet.</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
