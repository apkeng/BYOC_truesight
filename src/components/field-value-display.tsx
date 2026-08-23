"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FieldDef } from "@/lib/objects";

export function ReadonlyLookupLabel({
  table,
  labelField,
  id,
}: {
  table: string;
  labelField: string;
  id: string | null;
}) {
  const [resolved, setResolved] = useState<{ id: string; label: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let ignore = false;
    const supabase = createClient();
    supabase
      .from(table)
      .select(labelField)
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (ignore) return;
        const row = data as Record<string, unknown> | null;
        setResolved({ id, label: (row?.[labelField] as string) || null });
      });
    return () => {
      ignore = true;
    };
  }, [table, labelField, id]);

  const label = resolved && resolved.id === id ? resolved.label : null;
  return <p className="text-sm text-muted-foreground">{id ? label ?? "…" : "—"}</p>;
}

export function FieldValueDisplay({ field, value }: { field: FieldDef; value: unknown }) {
  if (field.type === "lookup" || field.type === "readonly-lookup") {
    return (
      <ReadonlyLookupLabel
        table={field.lookupTable!}
        labelField={field.lookupLabelField || "name"}
        id={(value as string) || null}
      />
    );
  }
  if (field.type === "readonly-datetime" || field.type === "datetime") {
    return (
      <p className="text-sm text-muted-foreground">
        {value ? new Date(value as string).toLocaleString() : "—"}
      </p>
    );
  }
  if (field.type === "date") {
    return (
      <p className="text-sm text-muted-foreground">
        {value ? new Date(value as string).toLocaleDateString() : "—"}
      </p>
    );
  }
  if (field.type === "tags") {
    const items = Array.isArray(value) ? (value as string[]) : [];
    return <p className="text-sm text-muted-foreground">{items.length > 0 ? items.join(", ") : "—"}</p>;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {value !== null && value !== undefined && value !== "" ? String(value) : "—"}
    </p>
  );
}
