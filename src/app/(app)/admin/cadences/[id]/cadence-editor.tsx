"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateCadence,
  saveCadenceSteps,
  saveCadenceTriggers,
  runCadenceEngineNow,
  enrollMatchingLeadsNow,
  type StepInput,
  type TriggerInput,
} from "../actions";
import { VALUELESS_OPERATORS, WHEN_OPERATOR_LABELS } from "@/lib/types";
import type {
  Cadence,
  CadenceStep,
  CadenceStepRun,
  CadenceTrigger,
  CadenceStepType,
  CadenceTriggerType,
  EmailTemplate,
  WorkflowWhenOperator,
} from "@/lib/types";

type DelayUnit = "minutes" | "hours" | "days";

interface StepRow {
  key: string;
  step_type: CadenceStepType;
  delay_value: number;
  delay_unit: DelayUnit;
  email_template_id: string | null;
  method: "GET" | "POST";
  url: string;
  headers_json: string;
  body_json: string;
}

interface TriggerRow {
  key: string;
  trigger_type: CadenceTriggerType;
  active: boolean;
  when_field: string;
  when_operator: WorkflowWhenOperator;
  when_value: string;
  schedule_type: "daily" | "interval";
  at_time: string;
  interval_minutes: number;
}

function minutesToUnit(minutes: number): { value: number; unit: DelayUnit } {
  if (minutes !== 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes !== 0 && minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

function unitToMinutes(value: number, unit: DelayUnit): number {
  if (unit === "days") return value * 1440;
  if (unit === "hours") return value * 60;
  return value;
}

function stepToRow(s: CadenceStep): StepRow {
  const { value, unit } = minutesToUnit(s.delay_minutes);
  return {
    key: s.id,
    step_type: s.step_type,
    delay_value: value,
    delay_unit: unit,
    email_template_id: s.email_template_id,
    method: s.external_api_config?.method === "GET" ? "GET" : "POST",
    url: s.external_api_config?.url || "",
    headers_json: JSON.stringify(s.external_api_config?.headers ?? {}, null, 2),
    body_json: JSON.stringify(s.external_api_config?.body_template ?? {}, null, 2),
  };
}

function triggerToRow(t: CadenceTrigger): TriggerRow {
  const c = t.config || {};
  const op = c.when_operator;
  return {
    key: t.id,
    trigger_type: t.trigger_type,
    active: t.active,
    when_field: (c.when_field as string) || "",
    // Triggers saved before operators existed have no when_operator, and they
    // all meant "equals".
    when_operator:
      op === "not_equals" || op === "is_blank" || op === "is_not_blank" ? op : "equals",
    when_value: (c.when_value as string) || "",
    schedule_type: c.schedule_type === "interval" ? "interval" : "daily",
    at_time: (c.at_time as string) || "09:00",
    interval_minutes: Number(c.interval_minutes) || 60,
  };
}

/**
 * Says plainly when each trigger type fires. The three behave very differently
 * and the difference is not guessable from the labels - a record_* trigger only
 * ever sees a lead that is saved after the trigger exists, which is why setting
 * one up and clicking "Run cadence engine now" enrolls nobody.
 */
const TRIGGER_HELP: Record<CadenceTriggerType, string> = {
  record_created: "Fires when a new lead is created and matches. Leads that already exist are not enrolled - use Enroll matching leads now for those.",
  record_updated: "Fires when an existing lead is saved and matches. Nothing happens until a lead is actually edited - use Enroll matching leads now to start on the leads you already have.",
  scheduled: "The engine checks every lead when this schedule comes due and enrolls the matches. Use Enroll matching leads now if you do not want to wait for the next due time.",
};

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `new-${keyCounter}`;
}

/**
 * The when_* half of a trigger's config. Shared by the save and by "Enroll
 * matching leads now" so the button always enrolls exactly the leads the
 * stored trigger would pick. when_value is dropped for the blank operators,
 * which ignore it.
 */
function conditionConfig(t: TriggerRow): Record<string, unknown> {
  const valueless = VALUELESS_OPERATORS.includes(t.when_operator);
  return {
    when_field: t.when_field || undefined,
    when_operator: t.when_operator,
    when_value: valueless ? undefined : t.when_value || undefined,
  };
}

/**
 * The field / operator / value row shared by both trigger layouts. The value
 * input disappears for the blank operators, which take no value - showing a
 * disabled box that silently does nothing is how admins end up believing the
 * trigger still compares against it.
 */
function ConditionFields({
  trigger,
  fieldLabel,
  onChange,
}: {
  trigger: TriggerRow;
  fieldLabel: string;
  onChange: (patch: Partial<TriggerRow>) => void;
}) {
  const needsValue = !VALUELESS_OPERATORS.includes(trigger.when_operator);
  return (
    <div className="flex gap-2">
      <div className="flex-1 space-y-1">
        <Label className="text-xs">{fieldLabel}</Label>
        <Input
          placeholder="e.g. user_type"
          value={trigger.when_field}
          onChange={(e) => onChange({ when_field: e.target.value })}
        />
      </div>
      <div className="flex-1 space-y-1">
        <Label className="text-xs">Comparison</Label>
        <Select
          value={trigger.when_operator}
          onValueChange={(v) => v && onChange({ when_operator: v as WorkflowWhenOperator })}
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
      </div>
      {needsValue && (
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Value</Label>
          <Input
            placeholder="e.g. Hot"
            value={trigger.when_value}
            onChange={(e) => onChange({ when_value: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function CadenceEditor({
  cadence,
  initialSteps,
  initialTriggers,
  templates,
  recentRuns,
}: {
  cadence: Cadence;
  initialSteps: CadenceStep[];
  initialTriggers: CadenceTrigger[];
  templates: EmailTemplate[];
  recentRuns: CadenceStepRun[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(cadence.name);
  const [description, setDescription] = useState(cadence.description || "");
  const [active, setActive] = useState(cadence.active);
  const [steps, setSteps] = useState<StepRow[]>(initialSteps.map(stepToRow));
  const [triggers, setTriggers] = useState<TriggerRow[]>(initialTriggers.map(triggerToRow));

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        key: newKey(),
        step_type: "email",
        delay_value: prev.length === 0 ? 0 : 1,
        delay_unit: "days",
        email_template_id: templates[0]?.id ?? null,
        method: "POST",
        url: "",
        headers_json: "{}",
        body_json: "{}",
      },
    ]);
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateStep(index: number, patch: Partial<StepRow>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function addTrigger() {
    setTriggers((prev) => [
      ...prev,
      {
        key: newKey(),
        trigger_type: "record_updated",
        active: true,
        when_field: "",
        when_operator: "equals",
        when_value: "",
        schedule_type: "daily",
        at_time: "09:00",
        interval_minutes: 60,
      },
    ]);
  }

  function updateTrigger(index: number, patch: Partial<TriggerRow>) {
    setTriggers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function removeTrigger(index: number) {
    setTriggers((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Validates and writes the whole cadence, returning whether it stuck.
   * Split out of saveAll so "Enroll matching leads now" can save first - the
   * leads it enrolls are then guaranteed to match the condition as stored,
   * not a half-edited one still sitting in the form.
   */
  async function persist(): Promise<boolean> {
    // Validate before touching the server.
    for (const s of steps) {
      if (s.step_type === "email" && !s.email_template_id) {
        toast.error("Every email step needs a template selected");
        return false;
      }
      if (s.step_type === "external_api") {
        if (!s.url.trim()) {
          toast.error("Every external API step needs a URL");
          return false;
        }
        try {
          JSON.parse(s.headers_json || "{}");
          JSON.parse(s.body_json || "{}");
        } catch {
          toast.error("Headers and body must be valid JSON");
          return false;
        }
      }
    }
    for (const t of triggers) {
      if (t.trigger_type === "scheduled" && t.schedule_type === "interval" && t.interval_minutes < 1) {
        toast.error("Interval must be at least 1 minute");
        return false;
      }
    }

    const stepInputs: StepInput[] = steps.map((s) => ({
      step_type: s.step_type,
      delay_minutes: unitToMinutes(s.delay_value, s.delay_unit),
      email_template_id: s.step_type === "email" ? s.email_template_id : null,
      external_api_config:
        s.step_type === "external_api"
          ? {
              method: s.method,
              url: s.url,
              headers: JSON.parse(s.headers_json || "{}"),
              body_template: JSON.parse(s.body_json || "{}"),
            }
          : null,
    }));

    const triggerInputs: TriggerInput[] = triggers.map((t) => ({
      trigger_type: t.trigger_type,
      active: t.active,
      config:
        t.trigger_type === "scheduled"
          ? {
              schedule_type: t.schedule_type,
              at_time: t.at_time,
              interval_minutes: t.interval_minutes,
              ...conditionConfig(t),
            }
          : conditionConfig(t),
    }));

    const results = await Promise.all([
      updateCadence(cadence.id, { name, description, active }),
      saveCadenceSteps(cadence.id, stepInputs),
      saveCadenceTriggers(cadence.id, triggerInputs),
    ]);
    const failed = results.find((r) => !r.success);
    if (failed) {
      toast.error(failed.error || "Failed to save");
      return false;
    }
    return true;
  }

  function saveAll() {
    startTransition(async () => {
      if (!(await persist())) return;
      toast.success("Cadence saved");
      router.refresh();
    });
  }

  /**
   * Applies one trigger's condition to the leads that already exist. Neither
   * record_created/record_updated (which only fire on a lead's own save) nor a
   * not-yet-due scheduled trigger will ever pick those up on their own, so this
   * is the only way to start a cadence on the leads already in the CRM.
   */
  function enrollNow(index: number) {
    const t = triggers[index];
    startTransition(async () => {
      if (!(await persist())) return;
      const result = await enrollMatchingLeadsNow(cadence.id, conditionConfig(t));
      if (!result.success) {
        toast.error(result.error || "Failed to enroll");
        return;
      }
      const matched = result.matched ?? 0;
      const enrolled = result.enrolled ?? 0;
      if (matched === 0) {
        toast.warning("No leads match this condition");
      } else if (enrolled === 0) {
        toast.info(`All ${matched} matching leads are already enrolled`);
      } else {
        toast.success(`Enrolled ${enrolled} of ${matched} matching leads`);
      }
      router.refresh();
    });
  }

  function runNow() {
    startTransition(async () => {
      const result = await runCadenceEngineNow();
      if (!result.success) {
        toast.error(result.error || "Failed to run");
        return;
      }
      const s = result.summary!;
      toast.success(
        `Ran engine: ${s.enrolled} enrolled, ${s.stepsExecuted} steps executed, ${s.completed} completed, ${s.failed} failed`
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>Active</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Triggers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Leave the field blank to match every lead. Each trigger type fires at a different moment - see
            the note under each one. &ldquo;Run cadence engine now&rdquo; only delivers due steps and checks
            scheduled triggers; it never enrolls for an on-created/on-updated trigger. You can also enroll by
            hand via Lead Lists → Send to cadence.
          </p>
          {triggers.map((t, i) => (
            <div key={t.key} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Select
                  value={t.trigger_type}
                  onValueChange={(v) => v && updateTrigger(i, { trigger_type: v as CadenceTriggerType })}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="record_created">On lead created</SelectItem>
                    <SelectItem value="record_updated">On lead updated</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={t.active} onCheckedChange={(v) => updateTrigger(i, { active: v })} />
                    <Label className="text-xs">Active</Label>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => removeTrigger(i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {t.trigger_type !== "scheduled" && (
                <ConditionFields
                  trigger={t}
                  fieldLabel="Field (optional)"
                  onChange={(patch) => updateTrigger(i, patch)}
                />
              )}

              {t.trigger_type === "scheduled" && (
                <div className="space-y-2">
                  <Select
                    value={t.schedule_type}
                    onValueChange={(v) => v && updateTrigger(i, { schedule_type: v as "daily" | "interval" })}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily at a time (UTC)</SelectItem>
                      <SelectItem value="interval">Every N minutes</SelectItem>
                    </SelectContent>
                  </Select>
                  {t.schedule_type === "daily" ? (
                    <Input
                      type="time"
                      className="w-40"
                      value={t.at_time}
                      onChange={(e) => updateTrigger(i, { at_time: e.target.value })}
                    />
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      className="w-40"
                      value={t.interval_minutes}
                      onChange={(e) => updateTrigger(i, { interval_minutes: Number(e.target.value) })}
                    />
                  )}
                  <ConditionFields
                    trigger={t}
                    fieldLabel="Only leads where field (optional)"
                    onChange={(patch) => updateTrigger(i, patch)}
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground">{TRIGGER_HELP[t.trigger_type]}</p>
              <Button variant="outline" size="sm" disabled={isPending} onClick={() => enrollNow(i)}>
                Enroll matching leads now
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addTrigger}>
            Add trigger
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Runs top to bottom. The delay on a step is how long to wait after the previous step (or after
            enrollment, for the first step) before it fires.
          </p>
          {steps.map((s, i) => (
            <div key={s.key} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => moveStep(i, -1)} disabled={i === 0}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => moveStep(i, 1)}
                    disabled={i === steps.length - 1}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => removeStep(i)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Select
                  value={s.step_type}
                  onValueChange={(v) => v && updateStep(i, { step_type: v as CadenceStepType })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Send email</SelectItem>
                    <SelectItem value="external_api">External API call</SelectItem>
                  </SelectContent>
                </Select>
                <span className="flex items-center text-sm text-muted-foreground">wait</span>
                <Input
                  type="number"
                  min={0}
                  className="w-20"
                  value={s.delay_value}
                  onChange={(e) => updateStep(i, { delay_value: Number(e.target.value) })}
                />
                <Select
                  value={s.delay_unit}
                  onValueChange={(v) => v && updateStep(i, { delay_unit: v as DelayUnit })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minutes</SelectItem>
                    <SelectItem value="hours">hours</SelectItem>
                    <SelectItem value="days">days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {s.step_type === "email" ? (
                <Select
                  value={s.email_template_id ?? undefined}
                  onValueChange={(v) => v && updateStep(i, { email_template_id: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select value={s.method} onValueChange={(v) => v && updateStep(i, { method: v as "GET" | "POST" })}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="GET">GET</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="https://example.com/webhook?lead={{name}}"
                      value={s.url}
                      onChange={(e) => updateStep(i, { url: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Headers (JSON)</Label>
                    <Textarea
                      rows={2}
                      className="font-mono text-xs"
                      value={s.headers_json}
                      onChange={(e) => updateStep(i, { headers_json: e.target.value })}
                    />
                  </div>
                  {s.method === "POST" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Body template (JSON)</Label>
                      <Textarea
                        rows={3}
                        className="font-mono text-xs"
                        value={s.body_json}
                        onChange={(e) => updateStep(i, { body_json: e.target.value })}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Use <code>{"{{field_name}}"}</code> in the URL, headers, or body to merge in the lead&apos;s
                    field values.
                  </p>
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addStep}>
            Add step
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={saveAll} disabled={isPending}>
          {isPending ? "Saving..." : "Save cadence"}
        </Button>
        <Button variant="outline" onClick={runNow} disabled={isPending}>
          Run cadence engine now
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No activity yet — enroll leads with a trigger’s &quot;Enroll matching leads now&quot;, then click &quot;Run cadence engine now&quot; to deliver the first step.
                  </TableCell>
                </TableRow>
              )}
              {recentRuns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.run_at).toLocaleString()}
                  </TableCell>
                  <TableCell className={r.status === "failed" ? "text-destructive" : ""}>{r.status}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.detail || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
