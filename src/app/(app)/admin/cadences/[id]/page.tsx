import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/back-button";
import { CadenceEditor } from "./cadence-editor";
import type { Cadence, CadenceStep, CadenceStepRun, CadenceTrigger, EmailTemplate } from "@/lib/types";

export default async function CadenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: cadence }, { data: steps }, { data: triggers }, { data: templates }, { data: runs }] =
    await Promise.all([
      supabase.from("cadences").select("*").eq("id", id).single(),
      supabase.from("cadence_steps").select("*").eq("cadence_id", id).order("step_order", { ascending: true }),
      supabase.from("cadence_triggers").select("*").eq("cadence_id", id),
      supabase.from("email_templates").select("*").order("name", { ascending: true }),
      supabase
        .from("cadence_step_runs")
        .select("*, cadence_enrollments!inner(cadence_id, lead_id)")
        .eq("cadence_enrollments.cadence_id", id)
        .order("run_at", { ascending: false })
        .limit(20),
    ]);

  if (!cadence) notFound();

  return (
    <div className="space-y-6">
      <BackButton />
      <h1 className="text-2xl font-semibold">{(cadence as Cadence).name}</h1>
      <CadenceEditor
        cadence={cadence as Cadence}
        initialSteps={(steps as CadenceStep[]) || []}
        initialTriggers={(triggers as CadenceTrigger[]) || []}
        templates={(templates as EmailTemplate[]) || []}
        recentRuns={(runs as CadenceStepRun[]) || []}
      />
    </div>
  );
}
