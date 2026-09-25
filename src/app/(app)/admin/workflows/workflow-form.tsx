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
import { OBJECTS, OBJECT_KEYS, isObjectKey } from "@/lib/objects";
import { createClient } from "@/lib/supabase/client";
import {
  SCHEDULABLE_TRIGGER_TYPES,
  VALUELESS_OPERATORS,
  WHEN_OPERATOR_LABELS,
} from "@/lib/types";
import type { CustomField, EmailAlert, Workflow } from "@/lib/types";
import { createWorkflow, updateWorkflow } from "./actions";
import type {
  WorkflowRunMode,
  WorkflowTriggerType,
  WorkflowWhenMode,
  WorkflowWhenOperator,
} from "@/lib/types";

const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  field_update: "Field update",
  notification: "Notification",
  email_alert: "Email alert",
  external_post: "External POST",
  external_get: "External GET",
};

const ALL_TRIGGER_TYPES = Object.keys(TRIGGER_LABELS) as WorkflowTriggerType[];

const EXAMPLES: Record<WorkflowTriggerType, string> = {
  field_update: `{
  "when_field": "stage",
  "when_operator": "equals",
  "when_value": "Closed/Closed Lost",
  "when_mode": "always",
  "set_field": "owner",
  "set_value": "<user-uuid>"
}`,
  notification: `{
  "when_field": "stage",
  "when_operator": "equals",
  "when_value": "Contracting",
  "when_mode": "on_change",
  "notify_user_field": "owner",
  "title": "{{name}} moved to Contracting",
  "body": "Organization {{name}} is now in Contracting stage."
}`,
  external_post: `{
  "when_field": "stage",
  "when_operator": "equals",
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
  "when_operator": "equals",
  "when_value": "Hot",
  "when_mode": "on_change",
  "email_alert_id": ""
}`,
};

/**
 * Creates a workflow, or edits one when `workflow` is passed. The parent keys
 * this component by the workflow's id, so switching which workflow is being
 * edited remounts it and the state below re-seeds from the new row.
 */
export function WorkflowForm({
  workflow,
  onDone,
}: {
  workflow?: Workflow | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const editing = !!workflow;
  const schedule = workflow?.schedule_config || {};
  const [name, setName] = useState(workflow?.name ?? "");
  const [objectName, setObjectName] = useState(
    workflow && isObjectKey(workflow.object_name) ? workflow.object_name : OBJECT_KEYS[0]
  );
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>(
    workflow?.trigger_type ?? "field_update"
  );
  const [config, setConfig] = useState(
    workflow ? JSON.stringify(workflow.config ?? {}, null, 2) : EXAMPLES.field_update
  );
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [emailAlerts, setEmailAlerts] = useState<EmailAlert[]>([]);
  const [runMode, setRunMode] = useState<WorkflowRunMode>(workflow?.run_mode ?? "on_save");
  const [scheduleType, setScheduleType] = useState<"daily" | "interval">(
    schedule.schedule_type === "interval" ? "interval" : "daily"
  );
  const [atTime, setAtTime] = useState(
    typeof schedule.at_time === "string" ? schedule.at_time : "09:00"
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    Number(schedule.interval_minutes) || 60
  );

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

  const rawOperator = parsedConfig?.when_operator;
  const whenOperator: WorkflowWhenOperator =
    rawOperator === "not_equals" || rawOperator === "is_blank" || rawOperator === "is_not_blank"
      ? rawOperator
      : "equals";

  /**
   * Rewrites when_operator in the JSON, and drops when_value along with it for
   * the blank operators - leaving a stale value behind reads as though it still
   * matters, and it is the first thing an admin would blame when the workflow
   * fires on records they did not expect.
   */
  function onOperatorChange(v: WorkflowWhenOperator) {
    if (!parsedConfig) return;
    const next: Record<string, unknown> = { ...parsedConfig, when_operator: v };
    if (VALUELESS_OPERATORS.includes(v)) delete next.when_value;
    else if (next.when_value === undefined) next.when_value = "";
    setConfig(JSON.stringify(next, null, 2));
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

  const availableTriggerTypes = runMode === "scheduled" ? SCHEDULABLE_TRIGGER_TYPES : ALL_TRIGGER_TYPES;

  /**
   * Switching to a schedule can strand the form on an action a sweep cannot
   * perform, so the external ones fall back to field_update rather than leaving
   * a select showing an option that is no longer in its own list.
   */
  function onRunModeChange(v: WorkflowRunMode) {
    setRunMode(v);
    if (v === "scheduled" && !SCHEDULABLE_TRIGGER_TYPES.includes(triggerType)) {
      onTriggerChange("field_update");
    }
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
    if (
      parsed.when_operator !== undefined &&
      !["equals", "not_equals", "is_blank", "is_not_blank"].includes(String(parsed.when_operator))
    ) {
      toast.error('when_operator must be "equals", "not_equals", "is_blank" or "is_not_blank"');
      return;
    }
    if (VALUELESS_OPERATORS.includes(parsed.when_operator as WorkflowWhenOperator) && !parsed.when_field) {
      toast.error(`"${WHEN_OPERATOR_LABELS[whenOperator]}" needs a when_field to check`);
      return;
    }
    if (triggerType === "email_alert" && !parsed.email_alert_id) {
      toast.error("Pick the email alert this workflow should send");
      return;
    }
    if (runMode === "scheduled") {
      if (!SCHEDULABLE_TRIGGER_TYPES.includes(triggerType)) {
        toast.error(`${TRIGGER_LABELS[triggerType]} cannot run on a schedule`);
        return;
      }
      if (scheduleType === "interval" && intervalMinutes < 1) {
        toast.error("Interval must be at least 1 minute");
        return;
      }
    }
    if (unknown.length > 0) {
      toast.error(
        `Unknown field${unknown.length > 1 ? "s" : ""} on ${OBJECTS[objectName].labelPlural}: ${unknown.join(", ")}`
      );
      return;
    }

    startTransition(async () => {
      const input = {
        name,
        object_name: objectName,
        trigger_type: triggerType,
        config: parsed,
        run_mode: runMode,
        schedule_config:
          scheduleType === "interval"
            ? { schedule_type: "interval", interval_minutes: intervalMinutes }
            : { schedule_type: "daily", at_time: atTime },
      };
      if (workflow) {
        const result = await updateWorkflow(workflow.id, input);
        if (!result.success) toast.error(result.error || "Failed to save workflow");
        else {
          toast.success("Workflow saved");
          router.refresh();
          onDone?.();
        }
        return;
      }
      const result = await createWorkflow(input);
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
        <CardTitle className="text-base">
          {editing ? `Edit workflow: ${workflow.name}` : "New workflow"}
        </CardTitle>
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
                  {availableTriggerTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Run mode</Label>
            <Select value={runMode} onValueChange={(v) => v && onRunModeChange(v as WorkflowRunMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_save">When a record is created or updated</SelectItem>
                <SelectItem value="scheduled">On a schedule</SelectItem>
              </SelectContent>
            </Select>
            {runMode === "scheduled" && (
              <div className="space-y-2 rounded-md border p-3">
                <Select
                  value={scheduleType}
                  onValueChange={(v) => v && setScheduleType(v as "daily" | "interval")}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily at a time (UTC)</SelectItem>
                    <SelectItem value="interval">Every N minutes</SelectItem>
                  </SelectContent>
                </Select>
                {scheduleType === "daily" ? (
                  <Input
                    type="time"
                    className="w-40"
                    value={atTime}
                    onChange={(e) => setAtTime(e.target.value)}
                  />
                ) : (
                  <Input
                    type="number"
                    min={1}
                    className="w-40"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  At each due time the engine checks every{" "}
                  {OBJECTS[objectName].labelPlural.toLowerCase()} record and runs the action on all
                  that match the condition — every due run, not just the ones that newly match. Only
                  field updates, notifications and email alerts can be scheduled. Capped at 500
                  records per run.
                </p>
              </div>
            )}
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
            <Label>Compare the field by</Label>
            <Select
              value={whenOperator}
              disabled={!parsedConfig}
              onValueChange={(v) => v && onOperatorChange(v as WorkflowWhenOperator)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">{WHEN_OPERATOR_LABELS.equals}</SelectItem>
                <SelectItem value="not_equals">{WHEN_OPERATOR_LABELS.not_equals}</SelectItem>
                <SelectItem value="is_blank">{WHEN_OPERATOR_LABELS.is_blank}</SelectItem>
                <SelectItem value="is_not_blank">{WHEN_OPERATOR_LABELS.is_not_blank}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {VALUELESS_OPERATORS.includes(whenOperator)
                ? `Checks only whether when_field has been filled in — when_value is ignored and has been removed from the config. Empty text and an empty tag list both count as blank; 0 does not.`
                : `Compares when_field against when_value.`}
            </p>
          </div>

          {runMode === "on_save" ? (
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
                  <SelectItem value="on_change">Only when the condition starts matching</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {whenMode === "on_change"
                  ? "Fires once, on the save that moves the record into the condition. A record already matching stays quiet."
                  : "Re-fires on every save while the record matches, so a record saved repeatedly triggers repeatedly."}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              A scheduled workflow has no before-and-after to compare, so{" "}
              <code>when_mode</code> is ignored — every due run acts on every matching record.
            </p>
          )}
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
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {editing
                ? isPending
                  ? "Saving..."
                  : "Save changes"
                : isPending
                  ? "Creating..."
                  : "Create workflow"}
            </Button>
            {editing && (
              <Button type="button" variant="outline" disabled={isPending} onClick={onDone}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
