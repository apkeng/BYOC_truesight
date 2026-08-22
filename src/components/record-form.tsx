"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OBJECTS, type ObjectKey, type FieldDef } from "@/lib/objects";
import { createClient } from "@/lib/supabase/client";
import { createRecord, updateRecord } from "@/lib/record-actions";
import { canEditField } from "@/lib/permissions";
import type { CustomField, FieldPermission, PicklistValue, UserRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LookupField } from "@/components/lookup-field";

export function RecordForm({
  objectKey,
  mode,
  record,
  role,
}: {
  objectKey: ObjectKey;
  mode: "create" | "edit";
  record: Record<string, unknown>;
  role: UserRole;
}) {
  const def = OBJECTS[objectKey];
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of def.fields) {
      let v = record[f.name];
      if (f.type === "tags" && Array.isArray(v)) v = (v as string[]).join(", ");
      if (f.type === "datetime" && typeof v === "string") v = v.slice(0, 16);
      init[f.name] = v ?? "";
    }
    return init;
  });

  const [picklists, setPicklists] = useState<Record<string, PicklistValue[]>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [permissions, setPermissions] = useState<FieldPermission[]>([]);
  const [fieldOrder, setFieldOrder] = useState<string[]>(def.fields.map((f) => f.name));

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("page_layouts")
      .select("layout")
      .eq("object_name", def.table)
      .maybeSingle()
      .then(({ data }) => {
        const stored = (data?.layout as string[] | undefined) || [];
        const known = def.fields.map((f) => f.name);
        const valid = stored.filter((f) => known.includes(f));
        const missing = known.filter((f) => !valid.includes(f));
        setFieldOrder(valid.length > 0 ? [...valid, ...missing] : known);
      });

    supabase
      .from("picklist_values")
      .select("*")
      .eq("object_name", def.table)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const grouped: Record<string, PicklistValue[]> = {};
        for (const row of (data as PicklistValue[]) || []) {
          grouped[row.field_name] = grouped[row.field_name] || [];
          grouped[row.field_name].push(row);
        }
        setPicklists(grouped);
      });

    supabase
      .from("field_permissions")
      .select("*")
      .eq("object_name", def.table)
      .then(({ data }) => setPermissions((data as FieldPermission[]) || []));

    supabase
      .from("custom_fields")
      .select("*")
      .eq("object_name", def.table)
      .then(async ({ data }) => {
        const fields = (data as CustomField[]) || [];
        setCustomFields(fields);
        if (mode === "edit" && record.id && fields.length > 0) {
          const { data: cfv } = await supabase
            .from("custom_field_values")
            .select("*")
            .eq("record_id", record.id as string)
            .in("custom_field_id", fields.map((f) => f.id));
          const init: Record<string, unknown> = {};
          for (const row of cfv || []) {
            const field = fields.find((f) => f.id === row.custom_field_id);
            if (!field) continue;
            init[field.id] =
              field.field_type === "number"
                ? row.value_number
                : field.field_type === "lookup"
                ? row.value_lookup
                : row.value_text;
          }
          setCustomValues(init);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.table, mode, record.id]);

  function isVisible(field: FieldDef) {
    return !(mode === "create" && field.hiddenOnCreate);
  }

  function isReadonly(field: FieldDef) {
    if (field.type.startsWith("readonly")) return true;
    return !canEditField(role, def.table, field.name, permissions);
  }

  function set(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const f of def.fields) {
      if (f.required && isVisible(f) && !values[f.name]) {
        toast.error(`${f.label} is required`);
        return;
      }
    }

    const payload: Record<string, unknown> = {};
    for (const f of def.fields) {
      if (f.type.startsWith("readonly")) continue;
      if (mode === "create" && f.hiddenOnCreate) continue;
      let v = values[f.name];
      if (v === "") v = null;
      if (f.type === "tags") {
        v = v
          ? String(v)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      }
      if (f.type === "number" && v !== null) v = Number(v);
      payload[f.name] = v;
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createRecord(objectKey, payload, customValues)
          : await updateRecord(objectKey, record.id as string, payload, customValues);

      if (!result.success) {
        toast.error(result.error || "Something went wrong");
        return;
      }
      toast.success(mode === "create" ? `${def.label} created` : `${def.label} updated`);
      router.push(`/${objectKey}/${result.id}`);
      router.refresh();
    });
  }

  const orderedFields = fieldOrder
    .map((name) => def.fields.find((f) => f.name === name))
    .filter((f): f is FieldDef => !!f);

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {orderedFields.filter(isVisible).map((field) => (
        <div key={field.name} className="space-y-2">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive"> *</span>}
          </Label>
          <FieldInput
            field={field}
            value={values[field.name]}
            onChange={(v) => set(field.name, v)}
            readonly={isReadonly(field)}
            picklistOptions={picklists[field.picklistField || field.name] || []}
          />
        </div>
      ))}

      {customFields.length > 0 && (
        <div className="space-y-5 border-t pt-5">
          <h3 className="text-sm font-medium text-muted-foreground">Custom Fields</h3>
          {customFields.map((cf) => (
            <div key={cf.id} className="space-y-2">
              <Label>{cf.field_label}</Label>
              <CustomFieldInput
                field={cf}
                value={customValues[cf.id]}
                onChange={(v) => setCustomValues((prev) => ({ ...prev, [cf.id]: v }))}
                picklistOptions={picklists[cf.field_name] || []}
              />
            </div>
          ))}
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : mode === "create" ? "Create" : "Save changes"}
      </Button>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  readonly,
  picklistOptions,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  readonly: boolean;
  picklistOptions: PicklistValue[];
}) {
  if (field.type === "readonly-datetime") {
    return (
      <p className="text-sm text-muted-foreground">
        {value ? new Date(value as string).toLocaleString() : "—"}
      </p>
    );
  }
  if (field.type === "readonly-lookup") {
    return (
      <ReadonlyLookupLabel
        table={field.lookupTable!}
        labelField={field.lookupLabelField || "name"}
        id={(value as string) || null}
      />
    );
  }
  if (field.type === "readonly-text") {
    return <p className="text-sm text-muted-foreground">{(value as string) || "—"}</p>;
  }
  if (field.type === "lookup") {
    return (
      <LookupField
        table={field.lookupTable!}
        labelField={field.lookupLabelField || "name"}
        value={(value as string) || null}
        onChange={onChange}
        disabled={readonly}
      />
    );
  }
  if (field.type === "picklist") {
    return (
      <Select value={(value as string) || undefined} onValueChange={onChange} disabled={readonly}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {picklistOptions.map((opt) => (
            <SelectItem key={opt.id} value={opt.value}>
              {opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readonly}
      />
    );
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readonly}
      />
    );
  }
  if (field.type === "date") {
    return (
      <Input
        type="date"
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readonly}
      />
    );
  }
  if (field.type === "datetime") {
    return (
      <Input
        type="datetime-local"
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={readonly}
      />
    );
  }
  return (
    <Input
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={readonly}
    />
  );
}

function ReadonlyLookupLabel({
  table,
  labelField,
  id,
}: {
  table: string;
  labelField: string;
  id: string | null;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLabel(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from(table)
      .select(labelField)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as Record<string, unknown> | null;
        setLabel((row?.[labelField] as string) || null);
      });
  }, [table, labelField, id]);

  return <p className="text-sm text-muted-foreground">{id ? label ?? "…" : "—"}</p>;
}

function CustomFieldInput({
  field,
  value,
  onChange,
  picklistOptions,
}: {
  field: CustomField;
  value: unknown;
  onChange: (v: unknown) => void;
  picklistOptions: PicklistValue[];
}) {
  if (field.field_type === "number") {
    return (
      <Input
        type="number"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (field.field_type === "picklist") {
    return (
      <Select value={(value as string) || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {picklistOptions.map((opt) => (
            <SelectItem key={opt.id} value={opt.value}>
              {opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.field_type === "lookup" && field.lookup_object) {
    return (
      <LookupField
        table={field.lookup_object}
        labelField="name"
        value={(value as string) || null}
        onChange={onChange}
      />
    );
  }
  return <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />;
}
