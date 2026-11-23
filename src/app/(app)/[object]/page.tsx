import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { resolveLookupLabels } from "@/lib/lookup-labels";
import { formatShortDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { EntityAvatar } from "@/components/entity-avatar";
import { StatusPill } from "@/components/status-pill";
import { OwnerAvatar } from "@/components/owner-avatar";
import { StageFilterTabs } from "@/components/stage-filter-tabs";
import { LeadFilter } from "@/components/lead-filter";
import { FieldFilter } from "@/components/field-filter";
import {
  describeCondition,
  isFilterableObject,
  serializeFilters,
  type FilterField,
} from "@/lib/record-filters";
import {
  applyListFilters,
  listFilterParams,
  loadFilterFields,
  readListFilterState,
} from "@/lib/record-query";
import {
  RecordSelectionProvider,
  RecordRowCheckbox,
  RecordSelectAllCheckbox,
} from "@/components/record-selection";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

export default async function ObjectListPage({
  params,
  searchParams,
}: {
  params: Promise<{ object: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    status?: string;
    createdBy?: string;
    range?: string;
    filters?: string;
  }>;
}) {
  const { object } = await params;
  if (!isObjectKey(object)) notFound();
  const objectKey = object as ObjectKey;
  const def = OBJECTS[objectKey];
  const isLeads = objectKey === "leads";

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const filterable = isFilterableObject(objectKey);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const filterFields: FilterField[] = filterable
    ? (await loadFilterFields(supabase, objectKey)).fields
    : [];
  const state = readListFilterState(sp, filterFields);
  const { q, status, createdBy, range, conditions } = state;

  const { data: rows, count } = await applyListFilters(
    supabase.from(def.table).select("*", { count: "exact" }),
    objectKey,
    state,
    filterFields,
    user?.id
  )
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

    const { count: unfilteredCount } = await applyListFilters(
      supabase.from(def.table).select("id", { count: "exact", head: true }),
      objectKey,
      state,
      filterFields,
      user?.id,
      { skipStatus: true }
    );
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
    const params = listFilterParams(objectKey, state);
    params.set("page", String(p));
    return `/${objectKey}?${params.toString()}`;
  };

  // Params the status pills must carry over (they set q and status themselves).
  const pillParams = listFilterParams(objectKey, state);
  pillParams.delete("status");
  pillParams.delete("q");

  const exportHref = `/api/export/${objectKey}?${listFilterParams(objectKey, state).toString()}`;

  // Chip labels for lookup conditions (they store record ids).
  const conditionLookupLabels: Record<string, string> = {};
  for (const c of conditions) {
    const field = filterFields.find((f) => f.name === c.field);
    if (field?.kind !== "lookup" || !field.lookupTable || !c.values?.length) continue;
    const labelField = field.lookupLabelField || "name";
    const { data } = await supabase
      .from(field.lookupTable)
      .select(`id, ${labelField}`)
      .in("id", c.values);
    for (const r of (data as unknown as Record<string, unknown>[]) || []) {
      conditionLookupLabels[r.id as string] = (r[labelField] as string) || "(untitled)";
    }
  }

  function hrefWithConditions(next: typeof conditions) {
    const qs = listFilterParams(objectKey, { ...state, conditions: next }).toString();
    return qs ? `/${objectKey}?${qs}` : `/${objectKey}`;
  }

  function cellDisplay(row: Record<string, unknown>, col: string) {
    const field = def.fields.find((f) => f.name === col);
    const isLookup = field?.type === "lookup" || field?.type === "readonly-lookup";
    return isLookup ? lookupLabels[col]?.[row[col] as string] || "" : String(row[col] ?? "");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <BackButton />
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
            extraParams={pillParams.toString()}
          />
        </div>
      )}

      {(filterable || isLeads) && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {filterable && <FieldFilter fields={filterFields} conditions={conditions} />}
            {isLeads && <LeadFilter createdBy={createdBy} range={range} />}
            {filterable &&
              (count ? (
                <a href={exportHref} download>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="size-3.5" />
                    Export CSV ({count})
                  </Button>
                </a>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5" disabled>
                  <Download className="size-3.5" />
                  Export CSV
                </Button>
              ))}
          </div>
          {conditions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {conditions.map((c, i) => {
                const field = filterFields.find((f) => f.name === c.field)!;
                return (
                  <Link
                    key={`${i}-${serializeFilters([c])}`}
                    href={hrefWithConditions(conditions.filter((_, j) => j !== i))}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs hover:bg-muted/70"
                    title="Remove this filter"
                  >
                    {describeCondition(c, field, conditionLookupLabels)}
                    <X className="size-3" />
                  </Link>
                );
              })}
              <Link
                href={hrefWithConditions([])}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Clear field filters
              </Link>
            </div>
          )}
        </div>
      )}

      <RecordSelectionProvider
        objectKey={objectKey}
        objectLabel={def.label}
        objectLabelPlural={def.labelPlural}
        lists={userLists}
      >
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-11 w-10 pl-4">
                <RecordSelectAllCheckbox ids={(rows as Record<string, unknown>[] | null)?.map((r) => r.id as string) || []} />
              </TableHead>
              {def.listColumns.map((col) => {
                const field = def.fields.find((f) => f.name === col);
                const numeric = field?.type === "number";
                return (
                  <TableHead
                    key={col}
                    className={`h-11 text-xs font-medium tracking-wider text-muted-foreground uppercase ${
                      numeric ? "text-right" : ""
                    }`}
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
                  colSpan={def.listColumns.length + 1}
                  className="py-10 text-center text-muted-foreground"
                >
                  {conditions.length > 0 ? "No records match these filters." : "No records yet."}
                </TableCell>
              </TableRow>
            )}
            {(rows as Record<string, unknown>[] | null)?.map((row) => {
              const titleCol = def.listColumns[0];
              const title = cellDisplay(row, titleCol) || "(untitled)";
              const subtitle = def.subtitleField ? (row[def.subtitleField] as string) : null;

              return (
                <TableRow key={row.id as string}>
                  <TableCell className="py-3 pl-4">
                    <RecordRowCheckbox id={row.id as string} />
                  </TableCell>
                  {def.listColumns.map((col, i) => {
                    const field = def.fields.find((f) => f.name === col);

                    if (i === 0) {
                      return (
                        <TableCell key={col} className="py-3">
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
      </RecordSelectionProvider>
    </div>
  );
}
