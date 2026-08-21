import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { resolveLookupLabels } from "@/lib/lookup-labels";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
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
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { object } = await params;
  if (!isObjectKey(object)) notFound();
  const objectKey = object as ObjectKey;
  const def = OBJECTS[objectKey];

  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const searchField =
    def.titleField ||
    def.fields.find((f) => f.type === "text" && def.listColumns.includes(f.name))?.name;

  let query = supabase.from(def.table).select("*", { count: "exact" });
  if (q && searchField) {
    query = query.ilike(searchField, `%${q}%`);
  }
  const { data: rows, count } = await query
    .order("created_date", { ascending: false })
    .range(from, to);

  const lookupLabels = await resolveLookupLabels(
    supabase,
    def.fields,
    def.listColumns,
    (rows as Record<string, unknown>[]) || []
  );

  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{def.labelPlural}</h1>
        <div className="flex items-center gap-3">
          <SearchBar />
          <Link href={`/${objectKey}/new`}>
            <Button>New {def.label}</Button>
          </Link>
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              {def.listColumns.map((col) => (
                <TableHead key={col}>
                  {def.fields.find((f) => f.name === col)?.label || col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={def.listColumns.length} className="text-center text-muted-foreground">
                  No records yet.
                </TableCell>
              </TableRow>
            )}
            {(rows as Record<string, unknown>[] | null)?.map((row) => (
              <TableRow key={row.id as string}>
                {def.listColumns.map((col, i) => {
                  const field = def.fields.find((f) => f.name === col);
                  const isLookup = field?.type === "lookup" || field?.type === "readonly-lookup";
                  const display = isLookup
                    ? lookupLabels[col]?.[row[col] as string] || ""
                    : String(row[col] ?? "");
                  const cell = <TableCell key={col}>{display}</TableCell>;
                  return i === 0 ? (
                    <TableCell key={col}>
                      <Link href={`/${objectKey}/${row.id}`} className="text-primary hover:underline">
                        {display || "(untitled)"}
                      </Link>
                    </TableCell>
                  ) : (
                    cell
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/${objectKey}?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`}
              className={p === page ? "font-semibold underline" : "text-muted-foreground"}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
