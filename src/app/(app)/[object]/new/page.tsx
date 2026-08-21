import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { RecordForm } from "@/components/record-form";
import type { Profile } from "@/lib/types";

export default async function NewRecordPage({
  params,
}: {
  params: Promise<{ object: string }>;
}) {
  const { object } = await params;
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New {def.label}</h1>
      <RecordForm objectKey={objectKey} mode="create" record={{}} role={(profile as Profile).role} />
    </div>
  );
}
