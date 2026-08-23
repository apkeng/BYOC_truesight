import { avatarColorForId, initials } from "@/lib/badge-colors";

export function OwnerAvatar({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white ${avatarColorForId(id)}`}
      >
        {initials(label)}
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}
