"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CreatedByFilter = "me" | "all";
export type RangeFilter = "1d" | "7d" | "30d" | "all";

const RANGE_OPTIONS: { value: RangeFilter; label: string }[] = [
  { value: "1d", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function LeadFilter({
  basePath,
  q,
  createdBy,
  range,
}: {
  basePath: string;
  q?: string;
  createdBy: CreatedByFilter;
  range: RangeFilter;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftCreatedBy, setDraftCreatedBy] = useState<CreatedByFilter>(createdBy);
  const [draftRange, setDraftRange] = useState<RangeFilter>(range);

  function apply() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("createdBy", draftCreatedBy);
    params.set("range", draftRange);
    router.push(`${basePath}?${params.toString()}`);
    setOpen(false);
  }

  const isDefault = createdBy === "me" && range === "1d";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraftCreatedBy(createdBy);
          setDraftRange(range);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <ListFilter className="size-3.5" />
            Filter
            {!isDefault && <span className="size-1.5 rounded-full bg-primary" />}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Created by</label>
          <Select value={draftCreatedBy} onValueChange={(v) => v && setDraftCreatedBy(v as CreatedByFilter)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Me</SelectItem>
              <SelectItem value="all">Anyone</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Created</label>
          <Select value={draftRange} onValueChange={(v) => v && setDraftRange(v as RangeFilter)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="w-full" onClick={apply}>
          Apply filter
        </Button>
      </PopoverContent>
    </Popover>
  );
}
