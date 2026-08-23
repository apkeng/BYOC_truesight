import type { ObjectKey } from "@/lib/objects";

export const NAV_SECTIONS: { label: string; keys: ObjectKey[] }[] = [
  { label: "Pipeline", keys: ["organizations", "leads", "meetings", "demos"] },
  { label: "Revenue", keys: ["contracts", "invoices", "revenues"] },
];

export function sectionForObject(key: ObjectKey): string | undefined {
  return NAV_SECTIONS.find((s) => s.keys.includes(key))?.label;
}
