"use client";

import { useState } from "react";
import { WorkflowForm } from "./workflow-form";
import { WorkflowList } from "./workflow-list";
import type { Workflow } from "@/lib/types";

/** Holds which workflow, if any, the form on the left is editing. */
export function WorkflowsPanel({ workflows }: { workflows: Workflow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // Looked up from the fresh list so a workflow deleted mid-edit drops the form back to "new"
  const editing = workflows.find((w) => w.id === editingId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <WorkflowForm
        key={editing?.id ?? "new"}
        workflow={editing}
        onDone={() => setEditingId(null)}
      />
      <div className="rounded-md border bg-background">
        <WorkflowList
          workflows={workflows}
          editingId={editing?.id}
          onEdit={(w) => {
            setEditingId(w.id);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    </div>
  );
}
