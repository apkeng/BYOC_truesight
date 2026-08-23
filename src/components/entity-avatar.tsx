import { initials } from "@/lib/badge-colors";

export function EntityAvatar({ label }: { label: string }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-secondary-foreground">
      {initials(label)}
    </div>
  );
}
