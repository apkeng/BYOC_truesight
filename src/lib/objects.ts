export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "picklist"
  | "lookup"
  | "tags"
  | "readonly-text"
  | "readonly-datetime"
  | "readonly-lookup";

export type ObjectKey =
  | "organizations"
  | "leads"
  | "meetings"
  | "demos"
  | "contracts"
  | "invoices"
  | "revenues";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  /** for picklist: field_name to query in picklist_values (defaults to `name`) */
  picklistField?: string;
  /** for lookup: target object key or 'profiles' */
  lookupTable?: ObjectKey | "profiles";
  lookupLabelField?: string;
  required?: boolean;
  hiddenOnCreate?: boolean;
  /** render as currency (adds a `$` prefix and thousands separators) */
  isCurrency?: boolean;
}

export interface ObjectDef {
  key: ObjectKey;
  table: ObjectKey;
  label: string;
  labelPlural: string;
  /** field used as the record's display title, or null to synthesize one */
  titleField: string | null;
  listColumns: string[];
  fields: FieldDef[];
  /** picklist field used to power the "All / <values>" filter pills on the list page */
  statusField?: string;
  /** plain-text field shown as a muted second line under the list row's title */
  subtitleField?: string;
  /** one-line description shown under the page title on the list page */
  description: string;
}

export const OBJECTS: Record<ObjectKey, ObjectDef> = {
  organizations: {
    key: "organizations",
    table: "organizations",
    label: "Organization",
    labelPlural: "Organizations",
    titleField: "name",
    listColumns: ["name", "stage", "primary_industry", "billing_country", "owner"],
    statusField: "stage",
    subtitleField: "primary_industry",
    description: "Companies and accounts your team is engaging with.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "billing_address", label: "Billing Address", type: "textarea" },
      { name: "number_of_employees", label: "Number of Employees", type: "number" },
      { name: "primary_industry", label: "Primary Industry", type: "picklist" },
      { name: "annual_revenue", label: "Annual Revenue", type: "number", isCurrency: true },
      { name: "billing_country", label: "Billing Country", type: "text" },
      { name: "billing_state", label: "Billing State", type: "text" },
      { name: "stage", label: "Stage", type: "picklist" },
      { name: "owner", label: "Owner", type: "lookup", lookupTable: "profiles", lookupLabelField: "full_name", hiddenOnCreate: true },
      { name: "created_by", label: "Created By", type: "readonly-lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "created_date", label: "Created Date", type: "readonly-datetime" },
    ],
  },
  leads: {
    key: "leads",
    table: "leads",
    label: "Lead",
    labelPlural: "Leads",
    titleField: "name",
    listColumns: ["name", "current_organization", "work_email", "related_organization", "owner"],
    subtitleField: "current_organization",
    description: "People you're building relationships with, from first contact to close.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "current_organization", label: "Current Organization", type: "text" },
      { name: "previous_organization", label: "Previous Organization", type: "text" },
      { name: "user_type", label: "User Type", type: "text" },
      { name: "current_work_address", label: "Current Work Address", type: "textarea" },
      { name: "work_email", label: "Work Email", type: "text" },
      { name: "work_phone_number", label: "Work Phone Number", type: "text" },
      { name: "personal_email", label: "Personal Email", type: "text" },
      { name: "personal_phone_number", label: "Personal Phone Number", type: "text" },
      { name: "related_organization", label: "Related Organization", type: "lookup", lookupTable: "organizations", lookupLabelField: "name" },
      { name: "linkedin_profile", label: "LinkedIn Profile", type: "text" },
      { name: "lead_score", label: "Lead Score", type: "number" },
      { name: "owner", label: "Owner", type: "lookup", lookupTable: "profiles", lookupLabelField: "full_name", hiddenOnCreate: true },
      { name: "created_by", label: "Created By", type: "readonly-lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "created_date", label: "Created Date", type: "readonly-datetime" },
    ],
  },
  meetings: {
    key: "meetings",
    table: "meetings",
    label: "Meeting",
    labelPlural: "Meetings",
    titleField: "name",
    listColumns: ["name", "meeting_date", "related_organization", "owner"],
    description: "Every call and meeting logged against your pipeline.",
    fields: [
      { name: "name", label: "Name", type: "readonly-text", hiddenOnCreate: true },
      { name: "organizer", label: "Organizer", type: "lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "participants", label: "Participants (comma separated)", type: "tags" },
      { name: "length", label: "Length (minutes)", type: "number" },
      { name: "transcribed_notes", label: "Transcribed Notes", type: "textarea" },
      { name: "related_organization", label: "Related Organization", type: "lookup", lookupTable: "organizations", lookupLabelField: "name" },
      { name: "related_lead", label: "Related Lead", type: "lookup", lookupTable: "leads", lookupLabelField: "name" },
      { name: "meeting_date", label: "Meeting Date", type: "datetime" },
      { name: "meeting_link", label: "Meeting Link", type: "text" },
      { name: "owner", label: "Owner", type: "lookup", lookupTable: "profiles", lookupLabelField: "full_name", hiddenOnCreate: true },
      { name: "created_by", label: "Created By", type: "readonly-lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "created_date", label: "Created Date", type: "readonly-datetime" },
    ],
  },
  demos: {
    key: "demos",
    table: "demos",
    label: "Demo",
    labelPlural: "Demos",
    titleField: "name",
    listColumns: ["name", "date_of_demo", "related_organization", "owner"],
    description: "Product walkthroughs scheduled or delivered to prospects.",
    fields: [
      { name: "name", label: "Name", type: "readonly-text", hiddenOnCreate: true },
      { name: "date_of_demo", label: "Date of Demo", type: "datetime" },
      { name: "related_lead", label: "Related Lead", type: "lookup", lookupTable: "leads", lookupLabelField: "name" },
      { name: "notes_from_demo", label: "Notes from Demo", type: "textarea" },
      { name: "demo_recording_link", label: "Demo Recording Link", type: "text" },
      { name: "related_organization", label: "Related Organization", type: "lookup", lookupTable: "organizations", lookupLabelField: "name" },
      { name: "owner", label: "Owner", type: "lookup", lookupTable: "profiles", lookupLabelField: "full_name", hiddenOnCreate: true },
      { name: "created_by", label: "Created By", type: "readonly-lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "created_date", label: "Created Date", type: "readonly-datetime" },
    ],
  },
  contracts: {
    key: "contracts",
    table: "contracts",
    label: "Contract",
    labelPlural: "Contracts",
    titleField: null,
    listColumns: ["related_organization", "stage", "acv", "close_date", "owner"],
    statusField: "stage",
    subtitleField: "contract_term",
    description: "Everything signed, pending signature, or up for renewal this quarter.",
    fields: [
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "end_date", label: "End Date", type: "date" },
      { name: "date_of_signing", label: "Date of Signing", type: "date" },
      { name: "contract_term", label: "Contract Term", type: "text" },
      { name: "acv", label: "ACV", type: "number", isCurrency: true },
      { name: "attachment", label: "Attachment (URL)", type: "text" },
      { name: "related_lead", label: "Related Lead", type: "lookup", lookupTable: "leads", lookupLabelField: "name" },
      { name: "stage", label: "Stage", type: "picklist" },
      { name: "close_date", label: "Close Date", type: "date" },
      { name: "related_organization", label: "Related Organization", type: "lookup", lookupTable: "organizations", lookupLabelField: "name" },
      { name: "owner", label: "Owner", type: "lookup", lookupTable: "profiles", lookupLabelField: "full_name", hiddenOnCreate: true },
      { name: "created_by", label: "Created By", type: "readonly-lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "created_date", label: "Created Date", type: "readonly-datetime" },
    ],
  },
  invoices: {
    key: "invoices",
    table: "invoices",
    label: "Invoice",
    labelPlural: "Invoices",
    titleField: "invoice_number",
    listColumns: ["invoice_number", "related_organization", "invoice_value", "invoice_status", "date_of_invoice"],
    statusField: "invoice_status",
    subtitleField: "organization_name",
    description: "Bills issued to customers and their payment status.",
    fields: [
      { name: "date_of_invoice", label: "Date of Invoice", type: "date" },
      { name: "invoice_number", label: "Invoice ID", type: "text" },
      { name: "billing_address", label: "Billing Address", type: "textarea" },
      { name: "invoice_value", label: "Invoice Value", type: "number", isCurrency: true },
      { name: "invoice_currency", label: "Invoice Currency", type: "text" },
      { name: "invoice_status", label: "Invoice Status", type: "picklist" },
      { name: "related_contract", label: "Related Contract", type: "lookup", lookupTable: "contracts", lookupLabelField: "contract_term" },
      { name: "organization_name", label: "Organization Name", type: "text" },
      { name: "related_organization", label: "Related Organization", type: "lookup", lookupTable: "organizations", lookupLabelField: "name" },
      { name: "related_lead", label: "Related Lead", type: "lookup", lookupTable: "leads", lookupLabelField: "name" },
      { name: "created_by", label: "Created By", type: "readonly-lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "created_date", label: "Created Date", type: "readonly-datetime" },
    ],
  },
  revenues: {
    key: "revenues",
    table: "revenues",
    label: "Revenue",
    labelPlural: "Revenue",
    titleField: "organization_name",
    listColumns: ["organization_name", "date_of_revenue_recognition", "related_transaction_number", "related_owner"],
    subtitleField: "related_transaction_number",
    description: "Recognized revenue tied back to invoices and accounts.",
    fields: [
      { name: "related_invoice", label: "Related Invoice", type: "lookup", lookupTable: "invoices", lookupLabelField: "invoice_number" },
      { name: "date_of_revenue_recognition", label: "Date of Revenue Recognition", type: "date" },
      { name: "related_transaction_number", label: "Related Transaction Number", type: "text" },
      { name: "organization_name", label: "Organization Name", type: "text" },
      { name: "point_of_contact_from_organization", label: "Point of Contact from Organization", type: "text" },
      { name: "related_organization", label: "Related Organization", type: "lookup", lookupTable: "organizations", lookupLabelField: "name" },
      { name: "related_owner", label: "Related Owner", type: "lookup", lookupTable: "profiles", lookupLabelField: "full_name", hiddenOnCreate: true },
      { name: "created_by", label: "Created By", type: "readonly-lookup", lookupTable: "profiles", lookupLabelField: "full_name" },
      { name: "created_date", label: "Created Date", type: "readonly-datetime" },
    ],
  },
};

export const OBJECT_KEYS = Object.keys(OBJECTS) as ObjectKey[];

export function isObjectKey(value: string): value is ObjectKey {
  return (OBJECT_KEYS as string[]).includes(value);
}
