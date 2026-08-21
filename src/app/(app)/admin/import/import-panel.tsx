"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Workbook, type CellValue } from "exceljs";
import { OBJECTS, type ObjectKey, type FieldDef } from "@/lib/objects";
import { createClient } from "@/lib/supabase/client";
import { resolveLookupLabels } from "@/lib/lookup-labels";
import { importRecords, type ImportResult, type ImportRow } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MAX_ROWS = 2000;
const PREVIEW_ROWS = 5;

interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
}

export function ImportPanel({ objectKey }: { objectKey: ObjectKey }) {
  const def = OBJECTS[objectKey];
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [idColumn, setIdColumn] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  const importableFields = def.fields.filter((f) => !f.type.startsWith("readonly"));

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setResult(null);
    setIsParsing(true);
    try {
      const parsed = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : await parseXlsx(file);

      if (parsed.rows.length === 0) {
        toast.error("No data rows found in that file");
        return;
      }
      if (parsed.rows.length > MAX_ROWS) {
        toast.error(`File has ${parsed.rows.length} rows — split it into batches of ${MAX_ROWS} or fewer`);
        return;
      }

      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapFields(parsed.headers, importableFields));
      setIdColumn(autoMapIdColumn(parsed.headers));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setIsParsing(false);
    }
  }

  function updateMapping(fieldName: string, header: string | null) {
    setMapping((prev) => ({ ...prev, [fieldName]: !header || header === "__skip__" ? "" : header }));
  }

  function handleImport() {
    const mappedRows: ImportRow[] = rows.map((row) => {
      const values: Record<string, unknown> = {};
      for (const [fieldName, header] of Object.entries(mapping)) {
        if (!header) continue;
        values[fieldName] = row[header];
      }
      const id = idColumn ? String(row[idColumn] ?? "").trim() || null : null;
      return { id, values };
    });

    startTransition(async () => {
      const res = await importRecords(objectKey, mappedRows);
      setResult(res);
      if (!res.success) {
        toast.error(res.error || "Import failed");
        return;
      }
      toast.success(
        `${res.created} created, ${res.updated} updated${res.failed ? `, ${res.failed} failed` : ""}`
      );
      router.refresh();
    });
  }

  async function handleExport() {
    setIsExporting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from(def.table).select("*").limit(5000);
      if (error) {
        toast.error(error.message);
        return;
      }
      const existingRows = (data as Record<string, unknown>[]) || [];
      const lookupLabels = await resolveLookupLabels(
        supabase,
        def.fields,
        def.fields.map((f) => f.name),
        existingRows
      );

      const wb = new Workbook();
      const ws = wb.addWorksheet(def.labelPlural.slice(0, 31));
      ws.columns = [
        { header: "id", key: "id" },
        ...def.fields.map((f) => ({ header: f.label, key: f.name })),
      ];
      for (const row of existingRows) {
        const record: Record<string, unknown> = { id: row.id };
        for (const f of def.fields) {
          if (f.type === "lookup" || f.type === "readonly-lookup") {
            const rawId = row[f.name] as string | null;
            record[f.name] = rawId ? lookupLabels[f.name]?.[rawId] || "" : "";
          } else if (f.type === "tags") {
            record[f.name] = Array.isArray(row[f.name]) ? (row[f.name] as string[]).join(", ") : "";
          } else {
            record[f.name] = (row[f.name] as string | number | null) ?? "";
          }
        }
        ws.addRow(record);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${def.key}-export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const canImport = rows.length > 0 && mappedCount > 0 && !isPending;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
        <div className="flex-1">
          <p className="text-sm font-medium">1. Get data in, or out</p>
          <p className="text-sm text-muted-foreground">
            Upload an .xlsx or .csv file, or export current {def.labelPlural.toLowerCase()} to edit and
            re-upload.
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={isExporting}>
          {isExporting ? "Exporting..." : `Export current ${def.labelPlural.toLowerCase()}`}
        </Button>
        <Button onClick={() => fileInputRef.current?.click()} disabled={isParsing}>
          {isParsing ? "Reading..." : "Choose file"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {rows.length > 0 && (
        <>
          <div className="space-y-3 rounded-md border p-4">
            <div>
              <p className="text-sm font-medium">2. Match columns</p>
              <p className="text-sm text-muted-foreground">
                {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"}. Blank cells clear the field
                on matched records. Leave the Record ID unmatched to always create new records.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 border-b pb-3">
              <Label>Record ID (matches an existing record to update)</Label>
              <Select
                value={idColumn || "__skip__"}
                onValueChange={(v) => setIdColumn(!v || v === "__skip__" ? "" : v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__skip__">— Always create new —</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {importableFields.map((f) => (
              <div key={f.name} className="flex items-center justify-between gap-4">
                <Label>
                  {f.label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                <Select value={mapping[f.name] || "__skip__"} onValueChange={(v) => updateMapping(f.name, v)}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__skip__">— Don&apos;t import —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">3. Preview (first {Math.min(PREVIEW_ROWS, rows.length)} rows)</p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h}>{formatPreviewValue(row[h])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <Button onClick={handleImport} disabled={!canImport}>
            {isPending ? "Importing..." : `Import ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </Button>
        </>
      )}

      {result && (
        <div className="space-y-2 rounded-md border p-4">
          <p className="text-sm">
            <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated
            {result.failed > 0 && (
              <>
                , <strong className="text-destructive">{result.failed}</strong> failed
              </>
            )}
          </p>
          {result.notes.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
              {result.notes.map((n, i) => (
                <li key={i} className={n.level === "error" ? "text-destructive" : "text-muted-foreground"}>
                  Row {n.row}: {n.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatPreviewValue(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString();
  return String(v);
}

function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function autoMapFields(headers: string[], fields: FieldDef[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) {
    const match = headers.find(
      (h) => normalizeHeader(h) === normalizeHeader(f.name) || normalizeHeader(h) === normalizeHeader(f.label)
    );
    if (match) map[f.name] = match;
  }
  return map;
}

function autoMapIdColumn(headers: string[]): string {
  return (
    headers.find((h) => normalizeHeader(h) === "id" || normalizeHeader(h) === "recordid") || ""
  );
}

async function parseXlsx(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const wb = new Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? "").trim());
  });

  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const value = normalizeCellValue(row.getCell(i + 1).value);
      record[h] = value;
      if (value !== "" && value != null) hasValue = true;
    });
    if (hasValue) rows.push(record);
  });

  return { headers: headers.filter(Boolean), rows };
}

function normalizeCellValue(v: CellValue): unknown {
  if (v == null) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("text" in v && typeof (v as { text?: unknown }).text === "string") return (v as { text: string }).text;
    if ("result" in v) return (v as { result?: unknown }).result ?? "";
    if ("richText" in v) {
      return ((v as { richText: { text: string }[] }).richText || []).map((r) => r.text).join("");
    }
    return "";
  }
  return v;
}

function parseCsv(text: string): ParsedFile {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const record: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (h) record[h] = r[i] ?? "";
      });
      return record;
    });

  return { headers: headers.filter(Boolean), rows: dataRows };
}
