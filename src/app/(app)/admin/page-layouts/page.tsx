import { createClient } from "@/lib/supabase/server";
import { ObjectPicker } from "@/components/object-picker";
import { OBJECTS, OBJECT_KEYS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { LayoutEditor } from "./layout-editor";

export default async function PageLayoutsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ object?: string }>;
}) {
  const { object } = await searchParams;
  const objectName = (isObjectKey(object || "") ? object! : OBJECT_KEYS[0]) as ObjectKey;
  const def = OBJECTS[objectName];

  const supabase = await createClient();
  const { data: layout } = await supabase
    .from("page_layouts")
    .select("*")
    .eq("object_name", objectName)
    .maybeSingle();

  const defaultOrder = def.fields.map((f) => f.name);
  const storedOrder = (layout?.layout as string[] | undefined) || [];
  const validStored = storedOrder.filter((f) => defaultOrder.includes(f));
  const missing = defaultOrder.filter((f) => !validStored.includes(f));
  const initialOrder = validStored.length > 0 ? [...validStored, ...missing] : defaultOrder;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Page Layouts</h1>
      <p className="text-sm text-muted-foreground">
        Controls the field order shown on {def.label} forms. Falls back to schema order if unset.
      </p>
      <ObjectPicker current={objectName} />
      <LayoutEditor objectName={objectName} initialOrder={initialOrder} />
    </div>
  );
}
