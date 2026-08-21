import { createClient } from "@/lib/supabase/server";
import { WorkflowForm } from "./workflow-form";
import { WorkflowList } from "./workflow-list";
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
      <div className="grid gap-6 lg:grid-cols-2">
        <WorkflowForm />
        <div className="rounded-md border bg-background">
          <WorkflowList workflows={(workflows as Workflow[]) || []} />
        </div>
      </div>
    </div>
  );
}
