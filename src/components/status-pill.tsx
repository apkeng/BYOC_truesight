import { pillColorForValue } from "@/lib/badge-colors";

export function StatusPill({ value }: { value: string }) {
  const { bg, text, dot } = pillColorForValue(value);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bg} ${text}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {value}
    </span>
  );
}
