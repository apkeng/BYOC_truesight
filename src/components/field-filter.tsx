"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { LookupField } from "@/components/lookup-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  OPERATORS_BY_KIND,
  isValidCondition,
  operatorLabel,
  serializeFilters,
  type FilterCondition,
  type FilterField,
  type FilterOperator,
} from "@/lib/record-filters";

interface Draft extends FilterCondition {
  key: number;
}

let nextKey = 1;

function blankDraft(field: FilterField): Draft {
  return { key: nextKey++, field: field.name, op: OPERATORS_BY_KIND[field.kind][0] };
}

/**
 * "Filter by field" side panel: builds a list of AND-ed field conditions and
 * writes them to the `filters` search param, keeping every other param
 * (search, status pill, lead created-by/range) as it was.
 */
export function FieldFilter({
  fields,
  conditions,
}: {
  fields: FilterField[];
  conditions: FilterCondition[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const fieldByName = (name: string) => fields.find((f) => f.name === name);

  function openPanel(o: boolean) {
    setOpen(o);
    if (o) {
      setShowErrors(false);
      setDrafts(
        conditions.length > 0
          ? conditions.map((c) => ({ ...c, key: nextKey++ }))
          : fields.length > 0
            ? [blankDraft(fields[0])]
            : []
      );
    }
  }

  function update(key: number, patch: Partial<FilterCondition>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function changeField(key: number, name: string) {
    const field = fieldByName(name);
    if (!field) return;
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...blankDraft(field), key } : d)));
  }

  function changeOp(d: Draft, op: FilterOperator) {
    const field = fieldByName(d.field)!;
    const wasDays = d.op === "last_days" || d.op === "next_days";
    const isDays = op === "last_days" || op === "next_days";
    // a date can't be reused as a day count (or vice versa)
    const keepValue = field.kind !== "date" && field.kind !== "datetime" ? true : wasDays === isDays;
    update(d.key, {
      op,
      value: keepValue ? d.value : undefined,
      value2: keepValue ? d.value2 : undefined,
    });
  }

  function push(next: FilterCondition[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) params.set("filters", serializeFilters(next));
    else params.delete("filters");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function apply() {
    const invalid = drafts.some((d) => !isValidCondition(d, fieldByName(d.field)));
    if (invalid) {
      setShowErrors(true);
      return;
    }
    push(drafts.map((d) => ({ field: d.field, op: d.op, value: d.value, value2: d.value2, values: d.values })));
    setOpen(false);
  }

  function clearAll() {
    push([]);
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openPanel(true)}>
        <SlidersHorizontal className="size-3.5" />
        Filter by field
        {conditions.length > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
            {conditions.length}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={openPanel}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Filter by field</SheetTitle>
            <SheetDescription>
              Records must match every condition. Works with standard and custom fields.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 px-4">
            {drafts.length === 0 && (
              <p className="text-sm text-muted-foreground">No conditions. Add one below.</p>
            )}
            {drafts.map((d) => {
              const field = fieldByName(d.field);
              if (!field) return null;
              const invalid = showErrors && !isValidCondition(d, field);
              return (
                <div
                  key={d.key}
                  className={`space-y-2 rounded-lg border p-3 ${invalid ? "border-destructive" : "border-border"}`}
                >
                  <div className="flex items-center gap-2">
                    <Select value={d.field} onValueChange={(v) => v && changeField(d.key, v as string)}>
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue>{(v: string) => fieldByName(v)?.label ?? v}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.name} value={f.name}>
                            {f.label}
                            {f.custom ? " (custom)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={d.op} onValueChange={(v) => v && changeOp(d, v as FilterOperator)}>
                      <SelectTrigger className="w-44">
                        <SelectValue>{(v: FilterOperator) => operatorLabel(field.kind, v)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS_BY_KIND[field.kind].map((op) => (
                          <SelectItem key={op} value={op}>
                            {operatorLabel(field.kind, op)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove condition"
                      onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <ValueEditor draft={d} field={field} onChange={(patch) => update(d.key, patch)} />
                  {invalid && <p className="text-xs text-destructive">Fill in a value for this condition.</p>}
                </div>
              );
            })}
            {fields.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setDrafts((prev) => [...prev, blankDraft(fields[0])])}
              >
                <Plus className="size-3.5" /> Add condition
              </Button>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={clearAll}>
              Clear all
            </Button>
            <Button onClick={apply}>Apply filters</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ValueEditor({
  draft,
  field,
  onChange,
}: {
  draft: FilterCondition;
  field: FilterField;
  onChange: (patch: Partial<FilterCondition>) => void;
}) {
  const { op } = draft;
  if (op === "is_blank" || op === "is_not_blank") return null;

  if (op === "last_days" || op === "next_days") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={3650}
          className="w-28"
          value={draft.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
        <span className="text-sm text-muted-foreground">days</span>
      </div>
    );
  }

  if (field.kind === "number" || field.kind === "date" || field.kind === "datetime") {
    const type = field.kind === "number" ? "number" : "date";
    if (op === "between") {
      return (
        <div className="flex items-center gap-2">
          <Input type={type} value={draft.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />
          <span className="text-sm text-muted-foreground">and</span>
          <Input type={type} value={draft.value2 ?? ""} onChange={(e) => onChange({ value2: e.target.value })} />
        </div>
      );
    }
    return <Input type={type} value={draft.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} />;
  }

  if (field.kind === "picklist") {
    const selected = draft.values || [];
    const options = field.options || [];
    // keep values that are no longer picklist options visible so they can be unticked
    const all = [...options, ...selected.filter((v) => !options.includes(v))];
    if (all.length === 0) {
      return <p className="text-xs text-muted-foreground">This picklist has no values yet.</p>;
    }
    return (
      <div className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-md border border-border p-2">
        {all.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(opt)}
              onCheckedChange={(checked) =>
                onChange({
                  values: checked ? [...selected, opt] : selected.filter((v) => v !== opt),
                })
              }
            />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === "lookup" && field.lookupTable) {
    return (
      <LookupField
        table={field.lookupTable}
        labelField={field.lookupLabelField || "name"}
        value={draft.values?.[0] ?? null}
        onChange={(id) => onChange({ values: id ? [id] : [] })}
      />
    );
  }

  return (
    <Input
      placeholder={field.kind === "tags" ? "Exact value, e.g. name@company.com" : "Value"}
      value={draft.value ?? ""}
      onChange={(e) => onChange({ value: e.target.value })}
    />
  );
}
