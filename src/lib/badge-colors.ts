function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const PILL_PALETTE = [
  { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
  { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
];

export function pillColorForValue(value: string) {
  return PILL_PALETTE[hashString(value) % PILL_PALETTE.length];
}

const AVATAR_PALETTE = [
  "bg-primary",
  "bg-teal-600",
  "bg-orange-500",
  "bg-violet-600",
  "bg-rose-500",
  "bg-cyan-600",
];

export function avatarColorForId(id: string): string {
  return AVATAR_PALETTE[hashString(id) % AVATAR_PALETTE.length];
}

export function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
