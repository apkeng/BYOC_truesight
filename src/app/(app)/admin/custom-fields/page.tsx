import { createClient } from "@/lib/supabase/server";
import { ObjectPicker } from "@/components/object-picker";
import { OBJECT_KEYS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { CustomFieldForm } from "./custom-field-form";
import { FieldList } from "./field-list";
import type { CustomField } from "@/lib/types";

export default async function CustomFieldsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ object?: string }>;
}) {
  const { object } = await searchParams;
  const objectName: ObjectKey = object && isObjectKey(object) ? object : OBJECT_KEYS[0];

  const supabase = await createClient();
  const { data: fields } = await supabase
    .from("custom_fields")
    .select("*")
    .eq("object_name", objectName)
    .order("field_label");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Custom Fields</h1>
      <ObjectPicker current={objectName} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CustomFieldForm objectName={objectName} />
        <div className="rounded-md border bg-background">
          <FieldList fields={(fields as CustomField[]) || []} />
        </div>
      </div>
    </div>
  );
}
