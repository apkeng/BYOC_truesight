"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { createClient } from "@/lib/supabase/client";
import type { CustomField, EmailAlert } from "@/lib/types";
import { createWorkflow } from "./actions";
import type { WorkflowTriggerType, WorkflowWhenMode } from "@/lib/types";

const EXAMPLES: Record<WorkflowTriggerType, string> = {
  field_update: `{
  "when_field": "stage",
  "when_value": "Closed/Closed Lost",
  "when_mode": "always",
  "set_field": "owner",
  "set_value": "<user-uuid>"
}`,
  notification: `{
  "when_field": "stage",
  "when_value": "Contracting",
  "when_mode": "on_change",
  "notify_user_field": "owner",
  "title": "{{name}} moved to Contracting",
  "body": "Organization {{name}} is now in Contracting stage."
}`,
  external_post: `{
  "when_field": "stage",
  "when_value": "Onboarded",
  "when_mode": "on_change",
  "url": "https://example.com/webhook",
  "headers": { "X-Api-Key": "secret" },
  "body_template": { "org": "{{name}}", "stage": "{{stage}}" }
}`,
  external_get: `{
  "url": "https://example.com/ping?org={{name}}"
}`,
  email_alert: `{
  "when_field": "lead_stage",
  "when_value": "Hot",
  "when_mode": "on_change",
  "email_alert_id": ""
}`,
};

export function WorkflowForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [objectName, setObjectName] = useState(OBJECT_KEYS[0]);
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>("field_update");
  const [config, setConfig] = useState(EXAMPLES.field_update);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [emailAlerts, setEmailAlerts] = useState<EmailAlert[]>([]);

  useEffect(() => {
    let ignore = false;
    createClient()
      .from("custom_fields")
      .select("*")
      .eq("object_name", OBJECTS[objectName].table)
      .then(({ data }) => {
        if (!ignore) setCustomFields((data as CustomField[]) || []);
      });
    return () => {
      ignore = true;
    };
  }, [objectName]);

  // Alerts are scoped to the object they were built for, so a workflow can only
  // pick one whose template's merge fields actually resolve on this record.
  useEffect(() => {
    let ignore = false;
    createClient()
      .from("email_alerts")
      .select("*")
      .eq("object_name", OBJECTS[objectName].table)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        if (!ignore) setEmailAlerts((data as EmailAlert[]) || []);
      });
    return () => {
      ignore = true;
    };
  }, [objectName]);

  const knownFields = useMemo(
    () => [
      "id",
      ...OBJECTS[objectName].fields.map((f) => f.name),
      ...customFields.map((f) => f.field_name),
    ],
    [objectName, customFields]
  );

  // The JSON textarea stays the source of truth; this select just reads and
  // rewrites the when_mode key so admins do not have to know it exists.
  const parsedConfig = useMemo(() => {
    try {
      const v = JSON.parse(config);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [config]);

  const whenMode: WorkflowWhenMode =
    parsedConfig?.when_mode === "on_change" ? "on_change" : "always";

  function onWhenModeChange(v: WorkflowWhenMode) {
    if (!parsedConfig) return;
    setConfig(JSON.stringify({ ...parsedConfig, when_mode: v }, null, 2));
  }

  const selectedAlertId =
    typeof parsedConfig?.email_alert_id === "string" ? parsedConfig.email_alert_id : "";

  function onAlertChange(v: string) {
    if (!parsedConfig) return;
    setConfig(JSON.stringify({ ...parsedConfig, email_alert_id: v }, null, 2));
  }

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
    // config keys whose value must name a real field on this object; an unknown
    // name silently never matches at runtime, which reads as "workflows are broken"
    const unknown = (["when_field", "set_field", "notify_user_field"] as const)
      .map((key) => parsed[key])
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .filter((v) => !knownFields.includes(v));
    if (parsed.when_mode !== undefined && parsed.when_mode !== "always" && parsed.when_mode !== "on_change") {
      toast.error('when_mode must be "always" or "on_change"');
      return;
    }
    if (parsed.when_mode === "on_change" && !parsed.when_field) {
      toast.error('"Only when it changes" needs a when_field to watch');
      return;
    }
    if (triggerType === "email_alert" && !parsed.email_alert_id) {
      toast.error("Pick the email alert this workflow should send");
      return;
    }
    if (unknown.length > 0) {
      toast.error(
        `Unknown field${unknown.length > 1 ? "s" : ""} on ${OBJECTS[objectName].labelPlural}: ${unknown.join(", ")}`
      );
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
                  <SelectItem value="email_alert">Email alert</SelectItem>
                  <SelectItem value="external_post">External POST</SelectItem>
                  <SelectItem value="external_get">External GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {triggerType === "email_alert" && (
            <div className="space-y-1.5">
              <Label>Email alert</Label>
              <Select
                value={selectedAlertId}
                disabled={!parsedConfig || emailAlerts.length === 0}
                onValueChange={(v) => v && onAlertChange(v as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick an email alert">
                    {(v) => emailAlerts.find((a) => a.id === v)?.name ?? "Pick an email alert"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {emailAlerts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {emailAlerts.length === 0
                  ? `No active email alerts for ${OBJECTS[objectName].labelPlural} yet - create one under Admin → Email Templates.`
                  : "Sends that alert's template to its recipients whenever this workflow's condition matches."}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Run when</Label>
            <Select
              value={whenMode}
              disabled={!parsedConfig}
              onValueChange={(v) => v && onWhenModeChange(v as WorkflowWhenMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Every save while the condition matches</SelectItem>
                <SelectItem value="on_change">Only when the field changes to that value</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {whenMode === "on_change"
                ? "Fires once, on the save that moves the field into the value. A record already sitting at that value stays quiet."
                : "Re-fires on every save while the field holds the value, so a record saved repeatedly triggers repeatedly."}
            </p>
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
            <p className="text-xs text-muted-foreground">
              Fields available on {OBJECTS[objectName].labelPlural}:{" "}
              <code className="break-words">{knownFields.join(", ")}</code>
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
