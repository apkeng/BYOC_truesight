"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EmailAlertRecipientType, EmailTemplate } from "@/lib/types";

/** The subset of a profile the recipient picker needs. */
export interface AlertUserOption {
  id: string;
  email: string;
  full_name: string | null;
}

export interface AlertFieldsValue {
  name: string;
  template_id: string | null;
  recipient_type: EmailAlertRecipientType;
  recipient_user_ids: string[];
  active: boolean;
}

/**
 * Name / template / recipients inputs, shared by the create card and the edit
 * dialog so the two can never drift apart.
 */
export function AlertFields({
  value,
  onChange,
  templates,
  users,
}: {
  value: AlertFieldsValue;
  onChange: (patch: Partial<AlertFieldsValue>) => void;
  templates: EmailTemplate[];
  users: AlertUserOption[];
}) {
  function toggleUser(id: string, checked: boolean) {
    const next = checked
      ? [...value.recipient_user_ids, id]
      : value.recipient_user_ids.filter((u) => u !== id);
    onChange({ recipient_user_ids: next });
  }

  const selectedTemplate = templates.find((t) => t.id === value.template_id) || null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          required
          placeholder="e.g. Hot lead assigned"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Email template</Label>
        <Select
          value={value.template_id ?? ""}
          onValueChange={(v) => v && onChange({ template_id: v as string })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {templates.length === 0 && (
          <p className="text-xs text-destructive">
            Create an email template first &mdash; an alert sends a template, it does not compose one.
          </p>
        )}
        {selectedTemplate && (
          <p className="text-xs text-muted-foreground">
            Subject: <span className="font-medium">{selectedTemplate.subject}</span>
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Send to</Label>
        <Select
          value={value.recipient_type}
          onValueChange={(v) => v && onChange({ recipient_type: v as EmailAlertRecipientType })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">Internal users</SelectItem>
            <SelectItem value="lead">The lead itself</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {value.recipient_type === "internal"
            ? "Goes to the CRM users you tick below. Merge fields still come from the lead that triggered it, so {{name}} is the lead's name."
            : "Goes to the lead the workflow fired on, using its work email (or personal email if there is no work email)."}
        </p>
      </div>

      {value.recipient_type === "internal" && (
        <div className="space-y-1.5">
          <Label>Internal recipients</Label>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
            {users.length === 0 && (
              <p className="text-xs text-muted-foreground">No users to pick.</p>
            )}
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={value.recipient_user_ids.includes(u.id)}
                  onCheckedChange={(checked) => toggleUser(u.id, checked === true)}
                />
                <span>{u.full_name || u.email}</span>
                {u.full_name && (
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch checked={value.active} onCheckedChange={(v) => onChange({ active: v })} />
        <Label>Active</Label>
      </div>
    </div>
  );
}
