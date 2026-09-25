import { createClient } from "@/lib/supabase/server";
import { WorkflowsPanel } from "./workflows-panel";
import type { Workflow } from "@/lib/types";

export default async function WorkflowsAdminPage() {
  const supabase = await createClient();
  const { data: workflows } = await supabase
    .from("workflows")
    .select("*")
    .order("created_date", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Workflows</h1>
      <WorkflowsPanel workflows={(workflows as Workflow[]) || []} />
    </div>
  );
}
