import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OBJECTS, isObjectKey, type ObjectKey } from "@/lib/objects";
import { RecordForm } from "@/components/record-form";
import { FieldViewPanel } from "@/components/field-view-panel";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { BackButton } from "@/components/back-button";
import { SendLeadEmailButton } from "./send-lead-email-button";
import type { EmailTemplate, Profile } from "@/lib/types";

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

  let emailTemplates: EmailTemplate[] = [];
  if (objectKey === "leads") {
    const { data } = await supabase
      .from("email_templates")
      .select("*")
      .eq("object_name", "leads")
      .order("name");
    emailTemplates = (data as EmailTemplate[]) || [];
  }

  return (
    <div>
      <BackButton />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title || "(untitled)"}</h1>
        <div className="flex items-center gap-2">
          {objectKey === "leads" && (
            <SendLeadEmailButton leadId={id} record={record} templates={emailTemplates} />
          )}
          {(profile as Profile).role === "admin" && (
            <DeleteRecordButton objectKey={objectKey} id={id} label={def.label} />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex-1">
          <RecordForm
            objectKey={objectKey}
            mode="edit"
            record={record}
            role={(profile as Profile).role}
          />
        </div>
        <FieldViewPanel objectKey={objectKey} record={record} />
      </div>
    </div>
  );
}
