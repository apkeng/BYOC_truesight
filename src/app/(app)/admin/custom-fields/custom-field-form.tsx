"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { OBJECTS, OBJECT_KEYS } from "@/lib/objects";
import { createCustomField } from "./actions";
import type { CustomFieldType } from "@/lib/types";

export function CustomFieldForm({ objectName }: { objectName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [picklistValues, setPicklistValues] = useState("");
  const [lookupObject, setLookupObject] = useState<string>(OBJECT_KEYS[0]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanFieldName = fieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    startTransition(async () => {
      const result = await createCustomField({
        object_name: objectName,
        field_name: cleanFieldName,
        field_label: fieldLabel,
        field_type: fieldType,
        picklist_values: picklistValues.split(",").map((s) => s.trim()).filter(Boolean),
        lookup_object: lookupObject,
      });
      if (!result.success) {
        toast.error(result.error || "Failed to create field");
        return;
      }
      toast.success("Custom field created");
      setFieldName("");
      setFieldLabel("");
      setPicklistValues("");
      router.refresh();
    });
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-base">New custom field on {OBJECTS[objectName as keyof typeof OBJECTS].label}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input required value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Field name (internal, snake_case)</Label>
            <Input required value={fieldName} onChange={(e) => setFieldName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="picklist">Picklist</SelectItem>
                <SelectItem value="lookup">Lookup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {fieldType === "picklist" && (
            <div className="space-y-1.5">
              <Label>Values (comma separated)</Label>
              <Input value={picklistValues} onChange={(e) => setPicklistValues(e.target.value)} />
            </div>
          )}
          {fieldType === "lookup" && (
            <div className="space-y-1.5">
              <Label>Looks up to</Label>
              <Select value={lookupObject} onValueChange={(v) => v && setLookupObject(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECT_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {OBJECTS[key].labelPlural}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create field"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
