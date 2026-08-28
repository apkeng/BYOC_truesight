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

export interface CustomFieldValue {
  id: string;
  custom_field_id: string;
  record_id: string;
  value_text: string | null;
  value_number: number | null;
  value_lookup: string | null;
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
  | "notification";

export interface Workflow {
  id: string;
  name: string;
  object_name: string;
  trigger_type: WorkflowTriggerType;
  config: Record<string, unknown>;
  active: boolean;
}

export interface EmailTemplate {
  id: string;
  object_name: string;
  name: string;
  subject: string;
  body: string;
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
