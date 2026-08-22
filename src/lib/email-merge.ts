import { OBJECTS, type FieldDef } from "@/lib/objects";

/** Fields whose raw record value is safe to merge as plain text (excludes lookups, which store a related record's id). */
export function mergeableFields(objectKey: keyof typeof OBJECTS): FieldDef[] {
  return OBJECTS[objectKey].fields.filter(
    (f) => f.type !== "lookup" && f.type !== "readonly-lookup"
  );
}

export function renderTemplate(text: string, record: Record<string, unknown>): string {
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, field: string) => {
    const value = record[field];
    return value === null || value === undefined || value === "" ? "" : String(value);
  });
}
