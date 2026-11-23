import type { SupabaseClient } from "@supabase/supabase-js";
import { OBJECTS, type ObjectKey } from "./objects";
import type { CustomField } from "./types";
import {
  buildFilterFields,
  parseFilters,
  serializeFilters,
  type FilterCondition,
  type FilterField,
} from "./record-filters";

/**
 * Server-side half of the list-page filters: loads the filterable fields for
 * an object and applies every list filter (search, status pill, lead
 * created-by/range, field filters) to a Supabase query. The list page and the
 * CSV export both go through applyListFilters, so an export always contains
 * exactly the records the filtered list shows.
 */

export type CreatedByFilter = "me" | "all";
export type RangeFilter = "1d" | "7d" | "30d" | "all";

export interface ListSearchParams {
  q?: string;
  status?: string;
  createdBy?: string;
  range?: string;
  filters?: string;
}

export interface ListFilterState {
  q?: string;
  status?: string;
  createdBy: CreatedByFilter;
  range: RangeFilter;
  conditions: FilterCondition[];
}

/** The object's filterable fields (built-in + custom) and its custom field definitions. */
export async function loadFilterFields(
  supabase: SupabaseClient,
  objectKey: ObjectKey
): Promise<{ fields: FilterField[]; customFields: CustomField[] }> {
  const table = OBJECTS[objectKey].table;
  const [{ data: custom }, { data: picks }] = await Promise.all([
    supabase.from("custom_fields").select("*").eq("object_name", table).order("field_label"),
    supabase
      .from("picklist_values")
      .select("field_name, value, sort_order")
      .eq("object_name", table)
      .order("sort_order", { ascending: true }),
  ]);
  const picklistOptions: Record<string, string[]> = {};
  for (const row of (picks as { field_name: string; value: string }[]) || []) {
    (picklistOptions[row.field_name] ||= []).push(row.value);
  }
  const customFields = (custom as CustomField[]) || [];
  return { fields: buildFilterFields(objectKey, customFields, picklistOptions), customFields };
}

export function readListFilterState(
  sp: ListSearchParams,
  fields: FilterField[]
): ListFilterState {
  return {
    q: sp.q || undefined,
    status: sp.status || undefined,
    // Leads default to "created by me, last 24 hours" until the user picks a different filter.
    createdBy: sp.createdBy === "all" ? "all" : "me",
    range: sp.range === "7d" || sp.range === "30d" || sp.range === "all" ? sp.range : "1d",
    conditions: parseFilters(sp.filters, fields),
  };
}

const RANGE_DAYS: Record<Exclude<RangeFilter, "all">, number> = { "1d": 1, "7d": 7, "30d": 30 };
const DAY_MS = 24 * 60 * 60 * 1000;
/** Dates the user types are Indian calendar days. */
const IST = "+05:30";

/** Quote a value for use inside a PostgREST or=(...) / in.(...) expression. */
function pq(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Escape LIKE wildcards so user text matches literally. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Today's date in India, as YYYY-MM-DD. */
function todayIst(): string {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function dayStart(ymd: string): string {
  return `${ymd}T00:00:00${IST}`;
}

// The Supabase filter builder's generic types don't survive being passed
// around; every method used here returns the same builder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

function applyCondition(query: Query, c: FilterCondition, field: FilterField): Query {
  const col = field.name;
  // text-like columns treat "" the same as NULL
  const textual = field.kind === "text" || field.kind === "picklist";

  switch (c.op) {
    case "is_blank":
      if (field.kind === "tags") return query.or(`${col}.is.null,${col}.eq.{}`);
      return textual ? query.or(`${col}.is.null,${col}.eq.""`) : query.is(col, null);
    case "is_not_blank":
      query = query.not(col, "is", null);
      if (field.kind === "tags") return query.neq(col, "{}");
      return textual ? query.neq(col, "") : query;

    // text
    case "contains":
      return query.ilike(col, `%${likeEscape(c.value!)}%`);
    case "not_contains":
      return query.or(`${col}.is.null,${col}.not.ilike.${pq(`%${likeEscape(c.value!)}%`)}`);
    case "equals":
      return query.ilike(col, likeEscape(c.value!.trim()));
    case "not_equals":
      return query.or(`${col}.is.null,${col}.not.ilike.${pq(likeEscape(c.value!.trim()))}`);
    case "starts_with":
      return query.ilike(col, `${likeEscape(c.value!)}%`);

    // number
    case "eq":
      return query.eq(col, Number(c.value));
    case "neq":
      return query.or(`${col}.is.null,${col}.neq.${Number(c.value)}`);
    case "gt":
      return query.gt(col, Number(c.value));
    case "gte":
      return query.gte(col, Number(c.value));
    case "lt":
      return query.lt(col, Number(c.value));
    case "lte":
      return query.lte(col, Number(c.value));

    // number + date
    case "between": {
      if (field.kind === "number") {
        const [lo, hi] = [Number(c.value), Number(c.value2)].sort((a, b) => a - b);
        return query.gte(col, lo).lte(col, hi);
      }
      const [lo, hi] = [c.value!, c.value2!].sort();
      return field.kind === "date"
        ? query.gte(col, lo).lte(col, hi)
        : query.gte(col, dayStart(lo)).lt(col, dayStart(addDays(hi, 1)));
    }

    // date
    case "on":
      return field.kind === "date"
        ? query.eq(col, c.value)
        : query.gte(col, dayStart(c.value!)).lt(col, dayStart(addDays(c.value!, 1)));
    case "before":
      return field.kind === "date" ? query.lt(col, c.value) : query.lt(col, dayStart(c.value!));
    case "after":
      return field.kind === "date"
        ? query.gt(col, c.value)
        : query.gte(col, dayStart(addDays(c.value!, 1)));
    case "last_days": {
      const n = Number(c.value);
      if (field.kind === "date") {
        const today = todayIst();
        return query.gte(col, addDays(today, -n)).lte(col, today);
      }
      const now = Date.now();
      return query
        .gte(col, new Date(now - n * DAY_MS).toISOString())
        .lte(col, new Date(now).toISOString());
    }
    case "next_days": {
      const n = Number(c.value);
      if (field.kind === "date") {
        const today = todayIst();
        return query.gte(col, today).lte(col, addDays(today, n));
      }
      const now = Date.now();
      return query
        .gte(col, new Date(now).toISOString())
        .lte(col, new Date(now + n * DAY_MS).toISOString());
    }

    // picklist + lookup
    case "any_of":
      return query.in(col, c.values!);
    case "none_of":
      return query.or(`${col}.is.null,${col}.not.in.(${c.values!.map(pq).join(",")})`);

    // tags (text[])
    case "includes":
      return query.contains(col, [c.value!.trim()]);
  }
  return query;
}

export function applyFieldFilters(
  query: Query,
  conditions: FilterCondition[],
  fields: FilterField[]
): Query {
  for (const c of conditions) {
    const field = fields.find((f) => f.name === c.field);
    if (field) query = applyCondition(query, c, field);
  }
  return query;
}

/**
 * Applies every list filter. `skipStatus` is for the "N of M" total next to
 * the status pills, which counts everything the other filters allow.
 */
export function applyListFilters(
  query: Query,
  objectKey: ObjectKey,
  state: ListFilterState,
  fields: FilterField[],
  userId: string | undefined,
  { skipStatus = false }: { skipStatus?: boolean } = {}
): Query {
  const def = OBJECTS[objectKey];
  const searchField =
    def.titleField ||
    def.fields.find((f) => f.type === "text" && def.listColumns.includes(f.name))?.name;

  if (state.q && searchField) query = query.ilike(searchField, `%${likeEscape(state.q)}%`);
  if (!skipStatus && state.status && def.statusField) query = query.eq(def.statusField, state.status);
  if (objectKey === "leads") {
    if (state.createdBy === "me" && userId) query = query.eq("created_by", userId);
    if (state.range !== "all") {
      query = query.gte(
        "created_date",
        new Date(Date.now() - RANGE_DAYS[state.range] * DAY_MS).toISOString()
      );
    }
  }
  return applyFieldFilters(query, state.conditions, fields);
}

/** The search params that reproduce a filter state (page excluded). */
export function listFilterParams(objectKey: ObjectKey, state: ListFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.status) params.set("status", state.status);
  if (objectKey === "leads") {
    params.set("createdBy", state.createdBy);
    params.set("range", state.range);
  }
  if (state.conditions.length > 0) params.set("filters", serializeFilters(state.conditions));
  return params;
}
