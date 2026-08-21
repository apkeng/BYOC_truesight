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
