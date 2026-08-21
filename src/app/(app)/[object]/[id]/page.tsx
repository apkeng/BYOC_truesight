import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { RecordForm } from "@/components/record-form";
import { DeleteRecordButton } from "@/components/delete-record-button";
import type { Profile } from "@/lib/types";

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ object: string; id: string }>;
}) {
  const { object, id } = await params;
  if (!isObjectKey(object)) notFound();
  const objectKey = object as ObjectKey;
  const def = OBJECTS[objectKey];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: record } = await supabase.from(def.table).select("*").eq("id", id).single();
  if (!record) notFound();

  const title = def.titleField ? (record[def.titleField] as string) : `${def.label} ${id.slice(0, 8)}`;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title || "(untitled)"}</h1>
        {(profile as Profile).role === "admin" && (
          <DeleteRecordButton objectKey={objectKey} id={id} label={def.label} />
        )}
      </div>
      <RecordForm
        objectKey={objectKey}
        mode="edit"
        record={record}
        role={(profile as Profile).role}
      />
    </div>
  );
}
