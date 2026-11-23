import { OBJECTS, type ObjectKey } from "./objects";
import type { CustomField } from "./types";

/**
 * Field-value filters for the record list pages (organizations, leads,
 * meetings, demos). Shared by the server page, the export route and the
 * client filter editor, so all three agree on which fields and operators
 * exist. The PostgREST translation lives in record-query.ts (server only).
 */

/** Objects whose list page offers field filters + CSV export. Revenue-side objects are left out on purpose. */
export const FILTERABLE_OBJECTS: ObjectKey[] = ["organizations", "leads", "meetings", "demos"];

export function isFilterableObject(key: ObjectKey): boolean {
  return FILTERABLE_OBJECTS.includes(key);
}

export type FilterKind = "text" | "number" | "date" | "datetime" | "picklist" | "lookup" | "tags";

export interface FilterField {
  name: string;
  label: string;
  kind: FilterKind;
  custom?: boolean;
  /** picklist options, in display order */
  options?: string[];
  /** lookup target table (an object table or "profiles") */
  lookupTable?: string;
  lookupLabelField?: string;
}

export type FilterOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "on"
  | "before"
  | "after"
  | "last_days"
  | "next_days"
  | "any_of"
  | "none_of"
  | "includes"
  | "is_blank"
  | "is_not_blank";

export interface FilterCondition {
  field: string;
  op: FilterOperator;
  /** single value (text, number, date, N days, lookup id) */
  value?: string;
  /** upper bound for "between" */
  value2?: string;
  /** picklist selections for any_of / none_of */
  values?: string[];
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "is",
  not_equals: "is not",
  starts_with: "starts with",
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "between",
  on: "on",
  before: "before",
  after: "after",
  last_days: "in the last N days",
  next_days: "in the next N days",
  any_of: "is any of",
  none_of: "is none of",
  includes: "includes",
  is_blank: "is blank",
  is_not_blank: "is not blank",
};

const BLANK_OPS: FilterOperator[] = ["is_blank", "is_not_blank"];

export const OPERATORS_BY_KIND: Record<FilterKind, FilterOperator[]> = {
  text: ["contains", "not_contains", "equals", "not_equals", "starts_with", ...BLANK_OPS],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", ...BLANK_OPS],
  date: ["on", "before", "after", "between", "last_days", "next_days", ...BLANK_OPS],
  datetime: ["on", "before", "after", "between", "last_days", "next_days", ...BLANK_OPS],
  picklist: ["any_of", "none_of", ...BLANK_OPS],
  lookup: ["any_of", "none_of", ...BLANK_OPS],
  tags: ["includes", ...BLANK_OPS],
};

/** Lookup conditions hold a single record id, so show them as "is" / "is not". */
export function operatorLabel(kind: FilterKind, op: FilterOperator): string {
  if (kind === "lookup" && op === "any_of") return "is";
  if (kind === "lookup" && op === "none_of") return "is not";
  return OPERATOR_LABELS[op];
}

/** The filterable fields of an object, built-in first, then custom. */
export function buildFilterFields(
  objectKey: ObjectKey,
  customFields: CustomField[],
  picklistOptions: Record<string, string[]>
): FilterField[] {
  const out: FilterField[] = [];
  for (const f of OBJECTS[objectKey].fields) {
    let kind: FilterKind;
    switch (f.type) {
      case "number":
        kind = "number";
        break;
      case "date":
        kind = "date";
        break;
      case "datetime":
      case "readonly-datetime":
        kind = "datetime";
        break;
      case "picklist":
        kind = "picklist";
        break;
      case "lookup":
      case "readonly-lookup":
        kind = "lookup";
        break;
      case "tags":
        kind = "tags";
        break;
      default:
        kind = "text";
    }
    const field: FilterField = { name: f.name, label: f.label, kind };
    if (kind === "picklist") field.options = picklistOptions[f.picklistField || f.name] || [];
    if (kind === "lookup") {
      field.lookupTable =
        f.lookupTable === "profiles" ? "profiles" : OBJECTS[f.lookupTable!]?.table;
      field.lookupLabelField = f.lookupLabelField || "name";
    }
    out.push(field);
  }
  for (const cf of customFields) {
    if (out.some((f) => f.name === cf.field_name)) continue;
    const kind: FilterKind =
      cf.field_type === "number"
        ? "number"
        : cf.field_type === "date"
          ? "date"
          : cf.field_type === "picklist"
            ? "picklist"
            : cf.field_type === "lookup" && cf.lookup_object
              ? "lookup"
              : "text";
    const field: FilterField = { name: cf.field_name, label: cf.field_label, kind, custom: true };
    if (kind === "picklist") {
      const fromTable = picklistOptions[cf.field_name] || [];
      field.options = fromTable.length > 0 ? fromTable : cf.picklist_values || [];
    }
    if (kind === "lookup") {
      const target = cf.lookup_object!;
      field.lookupTable =
        target === "profiles" ? "profiles" : OBJECTS[target as ObjectKey]?.table || target;
      field.lookupLabelField = target === "profiles" ? "full_name" : "name";
    }
    out.push(field);
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CONDITIONS = 20;

function isNum(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v));
}

function isDays(v: unknown): v is string {
  return typeof v === "string" && /^\d{1,4}$/.test(v) && Number(v) >= 1 && Number(v) <= 3650;
}

/** Whether a condition is complete and well-formed for its field. */
export function isValidCondition(c: FilterCondition, field: FilterField | undefined): boolean {
  if (!field) return false;
  if (!OPERATORS_BY_KIND[field.kind].includes(c.op)) return false;
  if (BLANK_OPS.includes(c.op)) return true;
  switch (field.kind) {
    case "text":
    case "tags":
      return typeof c.value === "string" && c.value.trim() !== "";
    case "number":
      return isNum(c.value) && (c.op !== "between" || isNum(c.value2));
    case "date":
    case "datetime":
      if (c.op === "last_days" || c.op === "next_days") return isDays(c.value);
      return (
        typeof c.value === "string" &&
        DATE_RE.test(c.value) &&
        (c.op !== "between" || (typeof c.value2 === "string" && DATE_RE.test(c.value2)))
      );
    case "picklist":
    case "lookup":
      return Array.isArray(c.values) && c.values.length > 0 && c.values.every((v) => typeof v === "string" && v !== "");
  }
}

/** Reads the `filters` search param, dropping anything malformed or naming an unknown field. */
export function parseFilters(raw: string | undefined | null, fields: FilterField[]): FilterCondition[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: FilterCondition[] = [];
  for (const item of parsed.slice(0, MAX_CONDITIONS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const c: FilterCondition = {
      field: String(o.field ?? ""),
      op: String(o.op ?? "") as FilterOperator,
    };
    if (typeof o.value === "string") c.value = o.value;
    if (typeof o.value2 === "string") c.value2 = o.value2;
    if (Array.isArray(o.values)) c.values = o.values.filter((v): v is string => typeof v === "string");
    if (isValidCondition(c, fields.find((f) => f.name === c.field))) out.push(c);
  }
  return out;
}

export function serializeFilters(conditions: FilterCondition[]): string {
  return JSON.stringify(
    conditions.map((c) => {
      const o: FilterCondition = { field: c.field, op: c.op };
      if (BLANK_OPS.includes(c.op)) return o;
      if (c.values) o.values = c.values;
      if (c.value !== undefined) o.value = c.value;
      if (c.op === "between" && c.value2 !== undefined) o.value2 = c.value2;
      return o;
    })
  );
}

/** Human-readable chip text, e.g. "Stage is any of Prospect, Won". */
export function describeCondition(
  c: FilterCondition,
  field: FilterField,
  lookupLabels: Record<string, string> = {}
): string {
  const op = operatorLabel(field.kind, c.op);
  if (BLANK_OPS.includes(c.op)) return `${field.label} ${op}`;
  if (c.op === "between") return `${field.label} between ${c.value} and ${c.value2}`;
  if (c.op === "last_days") return `${field.label} in the last ${c.value} days`;
  if (c.op === "next_days") return `${field.label} in the next ${c.value} days`;
  if (c.values) {
    const shown = c.values.map((v) => (field.kind === "lookup" ? lookupLabels[v] || "(unknown)" : v));
    return `${field.label} ${op} ${shown.join(", ")}`;
  }
  return `${field.label} ${op} "${c.value}"`;
}
