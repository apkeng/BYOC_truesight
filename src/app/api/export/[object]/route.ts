import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey, type FieldDef, type ObjectKey } from "@/lib/objects";
import { isFilterableObject } from "@/lib/record-filters";
import { resolveLookupLabels } from "@/lib/lookup-labels";
import {
  applyListFilters,
  loadFilterFields,
  readListFilterState,
  type ListSearchParams,
} from "@/lib/record-query";

/** Hard ceiling so one click can't pull an unbounded table into memory. */
const MAX_ROWS = 50000;
const BATCH = 1000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join("; ") : String(value);
  // Stop spreadsheet apps from evaluating text as a formula (CSV injection),
  // leaving genuine numbers like -5 alone.
  if (/^[=+\-@\t\r]/.test(s) && !(typeof value === "number" || /^-?\d+(\.\d+)?$/.test(s))) {
    s = `'${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** "2026-11-23 14:05" in India time, readable in Excel without reformatting. */
function istDateTime(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(request: Request, { params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  if (!isObjectKey(object) || !isFilterableObject(object)) {
    return NextResponse.json({ error: "Export is not available for this object" }, { status: 404 });
  }
  const objectKey = object as ObjectKey;
  const def = OBJECTS[objectKey];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sp: ListSearchParams = {
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    createdBy: url.searchParams.get("createdBy") ?? undefined,
    range: url.searchParams.get("range") ?? undefined,
    filters: url.searchParams.get("filters") ?? undefined,
  };

  const { fields, customFields } = await loadFilterFields(supabase, objectKey);
  const state = readListFilterState(sp, fields);

  // RLS still applies: the user's own client only returns rows they may read.
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    const query = applyListFilters(
      supabase.from(def.table).select("*"),
      objectKey,
      state,
      fields,
      user.id
    )
      .order("created_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, Math.min(from + BATCH, MAX_ROWS) - 1);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows.push(...((data as Record<string, unknown>[]) || []));
    if (!data || data.length < BATCH) break;
  }

  // Columns: every built-in field, then every custom field.
  const customDefs: FieldDef[] = customFields
    .filter((cf) => !def.fields.some((f) => f.name === cf.field_name))
    .map((cf) => ({
      name: cf.field_name,
      label: cf.field_label,
      type:
        cf.field_type === "number"
          ? "number"
          : cf.field_type === "date"
            ? "date"
            : cf.field_type === "lookup" && cf.lookup_object
              ? "lookup"
              : "text",
      lookupTable: cf.lookup_object ? (cf.lookup_object as ObjectKey | "profiles") : undefined,
      lookupLabelField: cf.lookup_object === "profiles" ? "full_name" : "name",
    }));
  const columns = [...def.fields, ...customDefs];
  const lookupLabels = await resolveLookupLabels(
    supabase,
    columns,
    columns.map((c) => c.name),
    rows
  );

  const lines = [["ID", ...columns.map((c) => c.label)].map(csvCell).join(",")];
  for (const row of rows) {
    const cells: unknown[] = [row.id];
    for (const col of columns) {
      const v = row[col.name];
      if (col.type === "lookup" || col.type === "readonly-lookup") {
        cells.push(v ? lookupLabels[col.name]?.[v as string] ?? v : "");
      } else if (col.type === "datetime" || col.type === "readonly-datetime") {
        cells.push(istDateTime(v));
      } else {
        cells.push(v);
      }
    }
    lines.push(cells.map(csvCell).join(","));
  }

  const stamp = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
  // BOM so Excel opens UTF-8 (names in Indian scripts etc.) correctly.
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${objectKey}-${stamp}.csv"`,
      "Cache-Control": "no-store",
      ...(rows.length >= MAX_ROWS ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}
