import { createClient } from "@/lib/supabase/server";
import { ObjectPicker } from "@/components/object-picker";
import { OBJECTS, OBJECT_KEYS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { PicklistManager } from "./picklist-manager";
import type { PicklistValue } from "@/lib/types";

export default async function PicklistsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ object?: string }>;
}) {
  const { object } = await searchParams;
  const objectName: ObjectKey = object && isObjectKey(object) ? object : OBJECT_KEYS[0];
  const def = OBJECTS[objectName];
  const picklistFieldNames = def.fields.filter((f) => f.type === "picklist").map((f) => f.name);

  const supabase = await createClient();
  const { data: values } = await supabase
    .from("picklist_values")
    .select("*")
    .eq("object_name", objectName)
    .order("sort_order");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Picklists</h1>
      <ObjectPicker current={objectName} />
      {picklistFieldNames.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {def.label} has no built-in picklist fields.
        </p>
      ) : (
        <PicklistManager
          objectName={objectName}
          picklistFieldNames={picklistFieldNames}
          values={(values as PicklistValue[]) || []}
        />
      )}
    </div>
  );
}
