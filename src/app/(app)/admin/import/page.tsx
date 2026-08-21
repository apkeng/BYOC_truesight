import { ObjectPicker } from "@/components/object-picker";
import { OBJECTS, OBJECT_KEYS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { ImportPanel } from "./import-panel";

export default async function ImportAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ object?: string }>;
}) {
  const { object } = await searchParams;
  const objectKey: ObjectKey = object && isObjectKey(object) ? object : OBJECT_KEYS[0];
  const def = OBJECTS[objectKey];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Data Import</h1>
        <p className="text-sm text-muted-foreground">
          Bulk create or update {def.labelPlural.toLowerCase()} from a spreadsheet.
        </p>
      </div>
      <ObjectPicker current={objectKey} />
      <ImportPanel objectKey={objectKey} />
    </div>
  );
}
