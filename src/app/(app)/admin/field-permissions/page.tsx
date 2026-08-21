import { createClient } from "@/lib/supabase/server";
import { ObjectPicker } from "@/components/object-picker";
import { OBJECTS, OBJECT_KEYS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { PermissionMatrix } from "./permission-matrix";
import type { FieldPermission } from "@/lib/types";

export default async function FieldPermissionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ object?: string }>;
}) {
  const { object } = await searchParams;
  const objectName: ObjectKey = object && isObjectKey(object) ? object : OBJECT_KEYS[0];
  const def = OBJECTS[objectName];

  const supabase = await createClient();
  const { data: permissions } = await supabase
    .from("field_permissions")
    .select("*")
    .eq("object_name", objectName)
    .eq("role", "sales");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Field Permissions</h1>
      <p className="text-sm text-muted-foreground">
        Admins can always view and edit every field. This controls what sales users can edit.
        A field without a specific override falls back to the &quot;*&quot; wildcard row.
      </p>
      <ObjectPicker current={objectName} />
      <div className="rounded-md border bg-background">
        <PermissionMatrix
          objectName={objectName}
          fields={def.fields}
          permissions={(permissions as FieldPermission[]) || []}
        />
      </div>
    </div>
  );
}
