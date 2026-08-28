/** Shared `{{field_name}}` merge-field substitution used by workflows and cadences. */
export function substitute(template: string, record: Record<string, unknown>) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
    const value = record[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function substituteDeep(value: unknown, record: Record<string, unknown>): unknown {
  if (typeof value === "string") return substitute(value, record);
  if (Array.isArray(value)) return value.map((v) => substituteDeep(v, record));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        substituteDeep(v, record),
      ])
    );
  }
  return value;
}
