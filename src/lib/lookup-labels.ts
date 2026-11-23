import type { SupabaseClient } from "@supabase/supabase-js";
import { OBJECTS, type FieldDef } from "@/lib/objects";

const LOOKUP_CHUNK = 150;

/**
 * For a set of rows and the lookup fields among `columns`, batch-fetches
 * display labels and returns a nested map: fieldName -> id -> label.
 */
export async function resolveLookupLabels(
  supabase: SupabaseClient,
  fields: FieldDef[],
  columns: string[],
  rows: Record<string, unknown>[]
): Promise<Record<string, Record<string, string>>> {
  const result: Record<string, Record<string, string>> = {};

  const lookupFields = fields.filter(
    (f) => columns.includes(f.name) && (f.type === "lookup" || f.type === "readonly-lookup")
  );

  for (const field of lookupFields) {
    const ids = Array.from(
      new Set(rows.map((r) => r[field.name]).filter((v): v is string => !!v))
    );
    if (ids.length === 0) {
      result[field.name] = {};
      continue;
    }
    const table = field.lookupTable === "profiles" ? "profiles" : OBJECTS[field.lookupTable!]?.table;
    if (!table) {
      result[field.name] = {};
      continue;
    }
    const labelField = field.lookupLabelField || "name";
    const map: Record<string, string> = {};
    // Chunked so a large export doesn't build an over-long request URL.
    for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
      const { data } = await supabase
        .from(table)
        .select(`id, ${labelField}`)
        .in("id", ids.slice(i, i + LOOKUP_CHUNK));
      for (const row of (data as unknown as Record<string, unknown>[]) || []) {
        map[row.id as string] = (row[labelField] as string) || "(untitled)";
      }
    }
    result[field.name] = map;
  }

  return result;
}
