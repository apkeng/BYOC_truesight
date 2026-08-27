"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { runWorkflows } from "@/lib/workflows";
import { saveCustomFieldValues } from "@/lib/record-actions";
import { OBJECTS, isObjectKey, type FieldDef, type ObjectKey } from "@/lib/objects";
import type { CustomField } from "@/lib/types";

export interface ImportRow {
  /** existing record id to update; null/empty to create a new record */
  id: string | null;
  /** field name -> raw cell value, already limited to mapped fields */
  values: Record<string, unknown>;
  /** custom_field id -> raw cell value, already limited to mapped custom fields */
  customValues?: Record<string, unknown>;
}

export interface ImportRowNote {
  row: number;
  message: string;
  level: "error" | "warning";
}

export interface ImportResult {
  success: boolean;
  error?: string;
  created: number;
  updated: number;
  failed: number;
  notes: ImportRowNote[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 2000;
const MAX_NOTES_RETURNED = 100;

function empty(overrides: Partial<ImportResult> = {}): ImportResult {
  return { success: false, created: 0, updated: 0, failed: 0, notes: [], ...overrides };
}

export async function importRecords(objectKey: string, rows: ImportRow[]): Promise<ImportResult> {
  if (!isObjectKey(objectKey)) return empty({ error: "Unknown object" });
  if (!Array.isArray(rows) || rows.length === 0) return empty({ error: "No rows to import" });
  if (rows.length > MAX_ROWS) {
    return empty({ error: `Too many rows (${rows.length}). Split the file into batches of ${MAX_ROWS} or fewer.` });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty({ error: "Unauthorized" });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return empty({ error: "Forbidden" });

  const def = OBJECTS[objectKey];
  const importableFields = new Map(
    def.fields.filter((f) => !f.type.startsWith("readonly")).map((f) => [f.name, f])
  );
  const lookupLabelMaps = await buildLookupLabelMaps(supabase, def.fields, rows);

  const { data: customFieldsData } = await supabase
    .from("custom_fields")
    .select("*")
    .eq("object_name", def.table);
  const customFields = new Map(((customFieldsData as CustomField[]) || []).map((f) => [f.id, f]));
  const customLookupMaps = await buildCustomLookupLabelMaps(supabase, customFields, rows);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const notes: ImportRowNote[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    const row = rows[i];
    const id = row.id && row.id.trim() ? row.id.trim() : null;

    try {
      const fields: Record<string, unknown> = {};
      const warnings: string[] = [];

      for (const [name, rawValue] of Object.entries(row.values || {})) {
        const field = importableFields.get(name);
        if (!field) continue;
        // Match the manual "New Record" form: fields hidden on create (e.g. owner)
        // are never set on insert, only on update.
        if (!id && field.hiddenOnCreate) continue;
        const { value, warning } = coerceValue(field, rawValue, lookupLabelMaps.get(name));
        fields[name] = value;
        if (warning) warnings.push(warning);
      }

      const customPayload: Record<string, unknown> = {};
      for (const [customFieldId, rawValue] of Object.entries(row.customValues || {})) {
        const field = customFields.get(customFieldId);
        if (!field) continue;
        const { value, warning } = coerceCustomValue(field, rawValue, customLookupMaps.get(customFieldId));
        customPayload[customFieldId] = value;
        if (warning) warnings.push(warning);
      }

      if (id) {
        if (!UUID_RE.test(id)) {
          notes.push({ row: rowNum, level: "error", message: `Invalid record ID "${id}"` });
          failed++;
          continue;
        }
        const { data, error } = await supabase
          .from(def.table)
          .update(fields)
          .eq("id", id)
          .select()
          .single();
        if (error || !data) {
          const message =
            error?.code === "PGRST116" ? `Record ID ${id} not found` : error?.message || `Record ID ${id} not found`;
          notes.push({ row: rowNum, level: "error", message });
          failed++;
          continue;
        }
        if (Object.keys(customPayload).length > 0) {
          await saveCustomFieldValues(objectKey, id, customPayload);
        }
        await runWorkflows(supabase, def.table, data);
        updated++;
        for (const w of warnings) notes.push({ row: rowNum, level: "warning", message: w });
      } else {
        const missing = def.fields.find(
          (f) => f.required && !f.hiddenOnCreate && isBlank(fields[f.name])
        );
        if (missing) {
          notes.push({ row: rowNum, level: "error", message: `${missing.label} is required` });
          failed++;
          continue;
        }
        const { data, error } = await supabase.from(def.table).insert(fields).select().single();
        if (error || !data) {
          notes.push({ row: rowNum, level: "error", message: error?.message || "Insert failed" });
          failed++;
          continue;
        }
        if (Object.keys(customPayload).length > 0) {
          await saveCustomFieldValues(objectKey, data.id, customPayload);
        }
        await runWorkflows(supabase, def.table, data);
        created++;
        for (const w of warnings) notes.push({ row: rowNum, level: "warning", message: w });
      }
    } catch (e) {
      failed++;
      notes.push({ row: rowNum, level: "error", message: e instanceof Error ? e.message : "Unexpected error" });
    }
  }

  revalidatePath(`/${objectKey}`);

  return {
    success: true,
    created,
    updated,
    failed,
    notes: notes.slice(0, MAX_NOTES_RETURNED),
  };
}

function isBlank(v: unknown) {
  return v === null || v === undefined || v === "";
}

function coerceValue(
  field: FieldDef,
  raw: unknown,
  lookupMap: Map<string, string> | undefined
): { value: unknown; warning?: string } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { value: field.type === "tags" ? [] : null };
  }

  switch (field.type) {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n)
        ? { value: n }
        : { value: null, warning: `"${raw}" is not a number for ${field.label}` };
    }
    case "tags": {
      const list = String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return { value: list };
    }
    case "date": {
      const s = toDateString(raw);
      return s ? { value: s } : { value: null, warning: `Could not parse date "${raw}" for ${field.label}` };
    }
    case "datetime": {
      const s = toDateTimeString(raw);
      return s ? { value: s } : { value: null, warning: `Could not parse date/time "${raw}" for ${field.label}` };
    }
    case "lookup": {
      const str = String(raw).trim();
      if (UUID_RE.test(str)) return { value: str };
      const resolved = lookupMap?.get(str.toLowerCase());
      if (resolved) return { value: resolved };
      return { value: null, warning: `Could not match "${str}" to a ${field.label}` };
    }
    default:
      return { value: String(raw) };
  }
}

function toDateString(raw: unknown): string | null {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toDateTimeString(raw: unknown): string | null {
  if (raw instanceof Date) return raw.toISOString().slice(0, 16);
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 16);
}

async function buildLookupLabelMaps(
  supabase: SupabaseClient,
  fields: FieldDef[],
  rows: ImportRow[]
): Promise<Map<string, Map<string, string>>> {
  const usedFieldNames = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.values || {})) usedFieldNames.add(key);
  }

  const lookupFields = fields.filter((f) => f.type === "lookup" && usedFieldNames.has(f.name));
  const result = new Map<string, Map<string, string>>();

  for (const field of lookupFields) {
    const table = field.lookupTable === "profiles" ? "profiles" : OBJECTS[field.lookupTable!]?.table;
    if (!table) continue;
    const labelField = field.lookupLabelField || "name";
    const { data } = await supabase.from(table).select(`id, ${labelField}`).limit(5000);
    const map = new Map<string, string>();
    for (const r of (data as unknown as Record<string, unknown>[]) || []) {
      const label = r[labelField];
      if (typeof label === "string" && label) map.set(label.trim().toLowerCase(), r.id as string);
    }
    result.set(field.name, map);
  }

  return result;
}

function coerceCustomValue(
  field: CustomField,
  raw: unknown,
  lookupMap: Map<string, string> | undefined
): { value: unknown; warning?: string } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { value: null };
  }

  switch (field.field_type) {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n)
        ? { value: n }
        : { value: null, warning: `"${raw}" is not a number for ${field.field_label}` };
    }
    case "lookup": {
      const str = String(raw).trim();
      if (UUID_RE.test(str)) return { value: str };
      const resolved = lookupMap?.get(str.toLowerCase());
      if (resolved) return { value: resolved };
      return { value: null, warning: `Could not match "${str}" to a ${field.field_label}` };
    }
    default:
      return { value: String(raw) };
  }
}

async function buildCustomLookupLabelMaps(
  supabase: SupabaseClient,
  customFields: Map<string, CustomField>,
  rows: ImportRow[]
): Promise<Map<string, Map<string, string>>> {
  const usedFieldIds = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.customValues || {})) usedFieldIds.add(key);
  }

  const result = new Map<string, Map<string, string>>();

  for (const field of customFields.values()) {
    if (field.field_type !== "lookup" || !usedFieldIds.has(field.id) || !field.lookup_object) continue;
    const table = OBJECTS[field.lookup_object as ObjectKey]?.table;
    if (!table) continue;
    const { data } = await supabase.from(table).select("id, name").limit(5000);
    const map = new Map<string, string>();
    for (const r of (data as unknown as Record<string, unknown>[]) || []) {
      const label = r.name;
      if (typeof label === "string" && label) map.set(label.trim().toLowerCase(), r.id as string);
    }
    result.set(field.id, map);
  }

  return result;
}
