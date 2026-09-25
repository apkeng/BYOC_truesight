export type UserRole = "admin" | "sales";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_by: string | null;
  created_at: string;
}

export interface PicklistValue {
  id: string;
  object_name: string;
  field_name: string;
  value: string;
  is_default: boolean;
  sort_order: number;
}

export type CustomFieldType = "number" | "text" | "picklist" | "lookup";

/**
 * An admin-defined field. The definition lives here; the *values* live in a
 * column named `field_name` on the object's own table, added by
 * create_custom_field (see supabase/migrations/*_custom_fields_as_columns.sql).
 */
export interface CustomField {
  id: string;
  object_name: string;
  field_name: string;
  field_label: string;
  field_type: CustomFieldType;
  picklist_values: string[] | null;
  lookup_object: string | null;
  default_value: string | null;
}

export interface FieldPermission {
  id: string;
  role: UserRole;
  object_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
}

export type WorkflowTriggerType =
  | "field_update"
  | "external_post"
  | "external_get"
  | "notification"
  | "email_alert";

/**
 * How a workflow's when_field/when_value condition is evaluated.
 * "always" re-fires on every save while the value matches; "on_change" fires
 * only on the save that moved the field into that value.
 */
export type WorkflowWhenMode = "always" | "on_change";

/**
 * How when_field is compared. Shared by workflow conditions and cadence
 * triggers, which both run through matches(). The blank operators ignore
 * when_value. Absent means "equals", so pre-existing configs are unchanged.
 */
export type WorkflowWhenOperator = "equals" | "not_equals" | "is_blank" | "is_not_blank";

/** Operators that need no when_value, so the UI hides the value input. */
export const VALUELESS_OPERATORS: WorkflowWhenOperator[] = ["is_blank", "is_not_blank"];

export const WHEN_OPERATOR_LABELS: Record<WorkflowWhenOperator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  is_blank: "is blank",
  is_not_blank: "is not blank",
};

/**
 * When a workflow runs.
 *   "on_save"   - after a record is created or updated (the original behaviour)
 *   "scheduled" - swept by the cron at a due time, across every matching record
 */
export type WorkflowRunMode = "on_save" | "scheduled";

/**
 * The actions a scheduled workflow may take. External calls are deliberately
 * excluded: a sweep can match hundreds of records, and firing that many
 * webhooks from a cron tick is a different feature with different needs.
 */
export const SCHEDULABLE_TRIGGER_TYPES: WorkflowTriggerType[] = [
  "field_update",
  "notification",
  "email_alert",
];

export interface Workflow {
  id: string;
  name: string;
  object_name: string;
  trigger_type: WorkflowTriggerType;
  config: Record<string, unknown>;
  active: boolean;
  /** Absent on rows written before scheduling existed; reads as "on_save". */
  run_mode?: WorkflowRunMode;
  /** Only meaningful when run_mode is "scheduled". See lib/schedule.ts. */
  schedule_config?: Record<string, unknown>;
  last_run_at?: string | null;
}

/**
 * Who an email alert goes to. Deliberately one or the other, never both: the
 * two audiences read very differently, so they want separate templates.
 *   "internal" - the hand-picked CRM users in recipient_user_ids
 *   "lead"     - the lead the workflow fired on
 */
export type EmailAlertRecipientType = "internal" | "lead";

/** A reusable email action a workflow can fire. See email_alerts. */
export interface EmailAlert {
  id: string;
  name: string;
  object_name: string;
  template_id: string | null;
  recipient_type: EmailAlertRecipientType;
  recipient_user_ids: string[];
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A call-to-action link or poster image attached to an email template. */
export interface EmailAttachment {
  id: string;
  type: "link" | "poster";
  name: string;
  url: string;
}

export interface EmailTemplate {
  id: string;
  object_name: string;
  name: string;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  template_id: string | null;
  object_name: string;
  record_id: string;
  to_email: string;
  subject: string;
  body: string;
  sent_by: string | null;
  status: string;
  error: string | null;
  sent_at: string;
}

export interface UserFieldView {
  id: string;
  user_id: string;
  object_name: string;
  fields: string[];
  updated_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  object_name: string | null;
  record_id: string | null;
  read: boolean;
  created_at: string;
}

export type CadenceStepType = "email" | "external_api";
export type CadenceTriggerType = "record_created" | "record_updated" | "scheduled";
export type CadenceEnrollmentStatus = "active" | "completed" | "removed";

export interface Cadence {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalApiConfig {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body_template?: Record<string, unknown>;
}

export interface CadenceStep {
  id: string;
  cadence_id: string;
  step_order: number;
  step_type: CadenceStepType;
  delay_minutes: number;
  email_template_id: string | null;
  external_api_config: ExternalApiConfig | null;
  active: boolean;
  created_at: string;
}

export interface CadenceTrigger {
  id: string;
  cadence_id: string;
  trigger_type: CadenceTriggerType;
  object_name: string;
  config: Record<string, unknown>;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
}

export interface CadenceEnrollment {
  id: string;
  cadence_id: string;
  lead_id: string;
  status: CadenceEnrollmentStatus;
  current_step_order: number;
  next_run_at: string | null;
  enrolled_by: string | null;
  enrolled_at: string;
  completed_at: string | null;
}

export interface CadenceStepRun {
  id: string;
  enrollment_id: string;
  step_id: string | null;
  status: string;
  detail: string | null;
  run_at: string;
}
