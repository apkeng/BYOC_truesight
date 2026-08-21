"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { OBJECTS, OBJECT_KEYS } from "@/lib/objects";
import { createWorkflow } from "./actions";
import type { WorkflowTriggerType } from "@/lib/types";

const EXAMPLES: Record<WorkflowTriggerType, string> = {
  field_update: `{
  "when_field": "stage",
  "when_value": "Closed/Closed Lost",
  "set_field": "owner",
  "set_value": "<user-uuid>"
}`,
  notification: `{
  "when_field": "stage",
  "when_value": "Contracting",
  "notify_user_field": "owner",
  "title": "{{name}} moved to Contracting",
  "body": "Organization {{name}} is now in Contracting stage."
}`,
  external_post: `{
  "when_field": "stage",
  "when_value": "Onboarded",
  "url": "https://example.com/webhook",
  "headers": { "X-Api-Key": "secret" },
  "body_template": { "org": "{{name}}", "stage": "{{stage}}" }
}`,
  external_get: `{
  "url": "https://example.com/ping?org={{name}}"
}`,
};

export function WorkflowForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [objectName, setObjectName] = useState(OBJECT_KEYS[0]);
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("field_update");
  const [config, setConfig] = useState(EXAMPLES.field_update);

  function onTriggerChange(v: WorkflowTriggerType) {
    setTriggerType(v);
    setConfig(EXAMPLES[v]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(config);
    } catch {
      toast.error("Config must be valid JSON");
      return;
    }
    startTransition(async () => {
      const result = await createWorkflow({
        name,
        object_name: objectName,
        trigger_type: triggerType,
        config: parsed,
      });
      if (!result.success) toast.error(result.error || "Failed to create workflow");
      else {
        toast.success("Workflow created");
        setName("");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New workflow</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Object</Label>
              <Select value={objectName} onValueChange={(v) => v && setObjectName(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECT_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {OBJECTS[key].labelPlural}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Trigger type</Label>
              <Select value={triggerType} onValueChange={(v) => onTriggerChange(v as WorkflowTriggerType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="field_update">Field update</SelectItem>
                  <SelectItem value="notification">Notification</SelectItem>
                  <SelectItem value="external_post">External POST</SelectItem>
                  <SelectItem value="external_get">External GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Config (JSON)</Label>
            <Textarea
              rows={8}
              className="font-mono text-xs"
              value={config}
              onChange={(e) => setConfig(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Runs after a create/update on the object when <code>when_field</code> equals{" "}
              <code>when_value</code> (omit both to run on every save). Use <code>{"{{field_name}}"}</code> in
              text values to substitute the record&apos;s field values.
            </p>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create workflow"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
