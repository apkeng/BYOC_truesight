import { createClient } from "@/lib/supabase/server";
import { CadenceList } from "./cadence-list";
import { NewCadenceForm } from "./new-cadence-form";
import type { Cadence } from "@/lib/types";

export default async function CadencesAdminPage() {
  const supabase = await createClient();

  const [{ data: cadences }, { data: steps }, { data: triggers }, { data: enrollments }] = await Promise.all([
    supabase.from("cadences").select("*").order("created_at", { ascending: false }),
    supabase.from("cadence_steps").select("cadence_id"),
    supabase.from("cadence_triggers").select("cadence_id"),
    supabase.from("cadence_enrollments").select("cadence_id").eq("status", "active"),
  ]);

  function countFor(rows: { cadence_id: string }[] | null, id: string) {
    return (rows || []).filter((r) => r.cadence_id === id).length;
  }

  const rows = ((cadences as Cadence[]) || []).map((c) => ({
    cadence: c,
    stepCount: countFor(steps, c.id),
    triggerCount: countFor(triggers, c.id),
    activeEnrollments: countFor(enrollments, c.id),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cadences</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <NewCadenceForm />
        <div className="rounded-md border bg-background">
          <CadenceList rows={rows} />
        </div>
      </div>
    </div>
  );
}
