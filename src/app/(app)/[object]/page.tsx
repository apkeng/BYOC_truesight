import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { resolveLookupLabels } from "@/lib/lookup-labels";
import { formatShortDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EntityAvatar } from "@/components/entity-avatar";
import { StatusPill } from "@/components/status-pill";
import { OwnerAvatar } from "@/components/owner-avatar";
import { StageFilterTabs } from "@/components/stage-filter-tabs";
import { LeadFilter, type CreatedByFilter, type RangeFilter } from "@/components/lead-filter";
import {
  LeadSelectionProvider,
  LeadRowCheckbox,
  LeadSelectAllCheckbox,
} from "@/components/lead-selection";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;
const RANGE_DAYS: Record<Exclude<RangeFilter, "all">, number> = { "1d": 1, "7d": 7, "30d": 30 };

function sinceIso(range: Exclude<RangeFilter, "all">) {
  return new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000).toISOString();
}

export default async function ObjectListPage({
  params,
  searchParams,
}: {
  params: Promise<{ object: string }>;
  searchParams: Promise<{ q?: string; page?: string; status?: string; createdBy?: string; range?: string }>;
}) {
  const { object } = await params;
  if (!isObjectKey(object)) notFound();
  const objectKey = object as ObjectKey;
  const def = OBJECTS[objectKey];
  const isLeads = objectKey === "leads";

  const { q, page: pageParam, status, createdBy: createdByParam, range: rangeParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Leads default to "created by me, last 24 hours" until the user picks a different filter.
  const createdBy: CreatedByFilter = createdByParam === "all" ? "all" : "me";
  const range: RangeFilter =
    rangeParam === "7d" || rangeParam === "30d" || rangeParam === "all" ? rangeParam : "1d";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const searchField =
    def.titleField ||
    def.fields.find((f) => f.type === "text" && def.listColumns.includes(f.name))?.name;

  function baseQuery() {
    let query = supabase.from(def.table).select("*", { count: "exact" });
    if (q && searchField) query = query.ilike(searchField, `%${q}%`);
    if (status && def.statusField) query = query.eq(def.statusField, status);
    if (isLeads) {
      if (createdBy === "me" && user) query = query.eq("created_by", user.id);
      if (range !== "all") {
        query = query.gte("created_date", sinceIso(range));
      }
    }
    return query;
  }

  const { data: rows, count } = await baseQuery()
    .order("created_date", { ascending: false })
    .range(from, to);

  let statusOptions: string[] = [];
  let totalCount = count || 0;
  if (def.statusField) {
    const { data: values } = await supabase
      .from("picklist_values")
      .select("value")
      .eq("object_name", def.table)
      .eq("field_name", def.statusField)
      .order("sort_order", { ascending: true });
    statusOptions = (values || []).map((v) => v.value as string);

    let unfilteredQuery = supabase.from(def.table).select("id", { count: "exact", head: true });
    if (q && searchField) unfilteredQuery = unfilteredQuery.ilike(searchField, `%${q}%`);
    const { count: unfilteredCount } = await unfilteredQuery;
    totalCount = unfilteredCount || 0;
  }

  const lookupLabels = await resolveLookupLabels(
    supabase,
    def.fields,
    def.listColumns,
    (rows as Record<string, unknown>[]) || []
  );

  let userLists: { id: string; name: string }[] = [];
  if (isLeads && user) {
    const { data } = await supabase
      .from("lead_lists")
      .select("id, name")
      .eq("created_by", user.id)
      .order("created_date", { ascending: false });
    userLists = data || [];
  }

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
  const qsBase = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (isLeads) {
      params.set("createdBy", createdBy);
      params.set("range", range);
    }
    params.set("page", String(p));
    return `/${objectKey}?${params.toString()}`;
  };

  function cellDisplay(row: Record<string, unknown>, col: string) {
    const field = def.fields.find((f) => f.name === col);
    const isLookup = field?.type === "lookup" || field?.type === "readonly-lookup";
    return isLookup ? lookupLabels[col]?.[row[col] as string] || "" : String(row[col] ?? "");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{def.labelPlural}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
        </div>
        <Link href={`/${objectKey}/new`}>
          <Button size="lg" className="gap-1.5 rounded-full">
            <Plus className="size-4" /> New {def.label}
          </Button>
        </Link>
      </div>

      {def.statusField && (
        <div className="mb-4">
          <StageFilterTabs
            basePath={`/${objectKey}`}
            q={q}
            current={status}
            options={statusOptions}
            filteredCount={count || 0}
            totalCount={totalCount}
          />
        </div>
      )}

      {isLeads && (
        <div className="mb-4 flex items-center justify-end">
          <LeadFilter basePath={`/${objectKey}`} q={q} createdBy={createdBy} range={range} />
        </div>
      )}

      <LeadSelectionProvider lists={userLists}>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {isLeads && (
                <TableHead className="h-11 w-10 pl-4">
                  <LeadSelectAllCheckbox ids={(rows as Record<string, unknown>[] | null)?.map((r) => r.id as string) || []} />
                </TableHead>
              )}
              {def.listColumns.map((col, i) => {
                const field = def.fields.find((f) => f.name === col);
                const numeric = field?.type === "number";
                return (
                  <TableHead
                    key={col}
                    className={`h-11 text-xs font-medium tracking-wider text-muted-foreground uppercase ${
                      i === 0 && !isLeads ? "pl-4" : ""
                    } ${numeric ? "text-right" : ""}`}
                  >
                    {field?.label || col}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows || []).length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={def.listColumns.length + (isLeads ? 1 : 0)}
                  className="py-10 text-center text-muted-foreground"
                >
                  No records yet.
                </TableCell>
              </TableRow>
            )}
            {(rows as Record<string, unknown>[] | null)?.map((row) => {
              const titleCol = def.listColumns[0];
              const title = cellDisplay(row, titleCol) || "(untitled)";
              const subtitle = def.subtitleField ? (row[def.subtitleField] as string) : null;

              return (
                <TableRow key={row.id as string}>
                  {isLeads && (
                    <TableCell className="py-3 pl-4">
                      <LeadRowCheckbox id={row.id as string} />
                    </TableCell>
                  )}
                  {def.listColumns.map((col, i) => {
                    const field = def.fields.find((f) => f.name === col);

                    if (i === 0) {
                      return (
                        <TableCell key={col} className={`py-3 ${isLeads ? "" : "pl-4"}`}>
                          <Link
                            href={`/${objectKey}/${row.id}`}
                            className="flex items-center gap-3 whitespace-normal"
                          >
                            <EntityAvatar label={title} />
                            <div>
                              <div className="font-medium text-foreground hover:underline">
                                {title}
                              </div>
                              {subtitle && (
                                <div className="text-xs text-muted-foreground">{subtitle}</div>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                      );
                    }

                    if (col === def.statusField) {
                      const value = row[col] as string;
                      return (
                        <TableCell key={col} className="py-3">
                          {value ? <StatusPill value={value} /> : "—"}
                        </TableCell>
                      );
                    }

                    if (field?.type === "lookup" && field.lookupTable === "profiles") {
                      const id = row[col] as string | null;
                      const label = id ? lookupLabels[col]?.[id] : null;
                      return (
                        <TableCell key={col} className="py-3">
                          {id && label ? <OwnerAvatar id={id} label={label} /> : "—"}
                        </TableCell>
                      );
                    }

                    if (field?.type === "number") {
                      return (
                        <TableCell key={col} className="py-3 text-right font-medium tabular-nums">
                          {formatNumber(row[col], !!field.isCurrency)}
                        </TableCell>
                      );
                    }

                    if (
                      field?.type === "date" ||
                      field?.type === "datetime" ||
                      field?.type === "readonly-datetime"
                    ) {
                      return (
                        <TableCell key={col} className="py-3 text-muted-foreground">
                          {formatShortDate(row[col])}
                        </TableCell>
                      );
                    }

                    return (
                      <TableCell key={col} className="py-3 whitespace-normal">
                        {cellDisplay(row, col) || "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Showing {rows?.length || 0} of {count || 0} {def.labelPlural.toLowerCase()}
          </span>
          <div className="flex items-center gap-2">
            {page <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                Prev
              </Button>
            ) : (
              <Link href={qsBase(page - 1)}>
                <Button variant="outline" size="sm">
                  Prev
                </Button>
              </Link>
            )}
            {page >= totalPages ? (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            ) : (
              <Link href={qsBase(page + 1)}>
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
      </LeadSelectionProvider>
    </div>
  );
}
