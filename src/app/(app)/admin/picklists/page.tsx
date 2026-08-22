import { createClient } from "@/lib/supabase/server";
import { ObjectPicker } from "@/components/object-picker";
import { OBJECTS, OBJECT_KEYS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { PicklistManager } from "./picklist-manager";
import type { CustomField, PicklistValue } from "@/lib/types";

export default async function PicklistsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ object?: string }>;
}) {
  const { object } = await searchParams;
  const objectName: ObjectKey = object && isObjectKey(object) ? object : OBJECT_KEYS[0];
  const def = OBJECTS[objectName];
  const builtInFields = def.fields
    .filter((f) => f.type === "picklist")
    .map((f) => ({ name: f.picklistField || f.name, label: f.label }));

  const supabase = await createClient();
  const [{ data: values }, { data: customFields }] = await Promise.all([
    supabase.from("picklist_values").select("*").eq("object_name", objectName).order("sort_order"),
    supabase
      .from("custom_fields")
      .select("*")
      .eq("object_name", objectName)
      .eq("field_type", "picklist"),
  ]);

  const customPicklistFields = ((customFields as CustomField[]) || []).map((f) => ({
    name: f.field_name,
    label: f.field_label,
  }));

  const picklistFields = [...builtInFields, ...customPicklistFields];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Picklists</h1>
      <ObjectPicker current={objectName} />
      {picklistFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {def.label} has no picklist fields.
        </p>
      ) : (
        <PicklistManager
          objectName={objectName}
          fields={picklistFields}
          values={(values as PicklistValue[]) || []}
        />
      )}
    </div>
  );
}
