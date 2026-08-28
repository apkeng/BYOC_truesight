import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/back-button";
import { DeleteLeadListButton } from "@/components/delete-lead-list-button";
import { ListMembersTable, type ListMemberRow } from "./list-members-table";

export default async function LeadListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: list } = await supabase.from("lead_lists").select("*").eq("id", id).single();
  if (!list) notFound();

  const { data: members } = await supabase
    .from("lead_list_members")
    .select("lead_id, leads(name, work_email, current_organization)")
    .eq("list_id", id);

  const rows: ListMemberRow[] = (members || []).map((m) => {
    const lead = m.leads as unknown as { name: string; work_email: string; current_organization: string } | null;
    return {
      leadId: m.lead_id,
      name: lead?.name || "",
      email: lead?.work_email || "",
      organization: lead?.current_organization || "",
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackButton />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{list.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} leads in this list.</p>
        </div>
        <DeleteLeadListButton listId={id} name={list.name} />
      </div>
      <ListMembersTable listId={id} rows={rows} />
    </div>
  );
}
