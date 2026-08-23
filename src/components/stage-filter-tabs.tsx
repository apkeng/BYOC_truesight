import Link from "next/link";
import { cn } from "@/lib/utils";

export function StageFilterTabs({
  basePath,
  q,
  current,
  options,
  filteredCount,
  totalCount,
}: {
  basePath: string;
  q?: string;
  current?: string;
  options: string[];
  filteredCount: number;
  totalCount: number;
}) {
  function href(status?: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  function pillClass(active: boolean) {
    return cn(
      "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "border border-border bg-background text-foreground hover:bg-muted"
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
      <Link href={href(undefined)} className={pillClass(!current)}>
        All
      </Link>
      {options.map((value) => (
        <Link key={value} href={href(value)} className={pillClass(current === value)}>
          {value}
        </Link>
      ))}
      <span className="ml-auto pr-2 text-sm text-muted-foreground">
        {filteredCount} of {totalCount}
      </span>
    </div>
  );
}
