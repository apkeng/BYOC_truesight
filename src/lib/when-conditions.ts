import { OBJECTS, type ObjectKey } from "./objects";
import {
  DATE_OPERATORS,
  NUMBER_OPERATORS,
  WHEN_OPERATORS,
  WHEN_OPERATOR_LABELS,
  readWhenOperator,
} from "./types";
import type { CustomField, WorkflowWhenOperator } from "./types";

/**
 * Editor-side helpers for a when_field condition, shared by the workflow form
 * and the cadence trigger editor so both offer the same comparisons and reject
 * the same mistakes. The matching itself lives in matches() (workflows.ts).
 */

/** Which kind of comparison a field supports beyond equals / blank. */
export type WhenFieldKind = "number" | "date";

/** Operators every field gets, whatever its type. */
const BASE_OPERATORS: WorkflowWhenOperator[] = ["equals", "not_equals", "is_blank", "is_not_blank"];

/** The number and date fields on an object, built-in and custom alike. */
export function whenFieldKinds(
  objectKey: ObjectKey,
  customFields: CustomField[]
): Record<string, WhenFieldKind> {
  const kinds: Record<string, WhenFieldKind> = {};
  for (const f of OBJECTS[objectKey].fields) {
    if (f.type === "number") kinds[f.name] = "number";
    if (f.type === "date" || f.type === "datetime" || f.type === "readonly-datetime") {
      kinds[f.name] = "date";
    }
  }
  for (const f of customFields) {
    if (f.field_type === "number") kinds[f.field_name] = "number";
    if (f.field_type === "date") kinds[f.field_name] = "date";
  }
  return kinds;
}

/**
 * The operators to offer for a field. Never drops `current`, so a select
 * holding an operator that no longer suits the field still shows it - the
 * validation below then says why that pairing is rejected.
 */
export function operatorsFor(
  kind: WhenFieldKind | undefined,
  current: WorkflowWhenOperator
): WorkflowWhenOperator[] {
  return WHEN_OPERATORS.filter(
    (op) =>
      BASE_OPERATORS.includes(op) ||
      op === current ||
      (kind === "number" && NUMBER_OPERATORS.includes(op)) ||
      (kind === "date" && DATE_OPERATORS.includes(op))
  );
}

/** Config keys only some operators use, dropped when switching operator. */
export const OPERATOR_ONLY_KEYS = ["when_value_to", "when_unit"] as const;

function isNumeric(v: unknown): boolean {
  return (
    (typeof v === "number" || typeof v === "string") &&
    String(v).trim() !== "" &&
    Number.isFinite(Number(String(v).trim()))
  );
}

/**
 * Checks a condition's operator against its field and values. Returns the
 * message to show, or null when it is fine. An empty or non-numeric value
 * would otherwise make the condition silently never match.
 */
export function conditionError(
  config: Record<string, unknown>,
  kinds: Record<string, WhenFieldKind>
): string | null {
  if (config.when_operator !== undefined && !WHEN_OPERATORS.includes(config.when_operator as WorkflowWhenOperator)) {
    return `when_operator must be one of: ${WHEN_OPERATORS.join(", ")}`;
  }
  const operator = readWhenOperator(config.when_operator);
  const field = typeof config.when_field === "string" ? config.when_field : "";
  const label = WHEN_OPERATOR_LABELS[operator];
  if (operator !== "equals" && operator !== "not_equals" && !field) {
    return `"${label}" needs a field to check`;
  }
  if (NUMBER_OPERATORS.includes(operator)) {
    if (kinds[field] !== "number") return `"${label}" only works on a number field`;
    if (!isNumeric(config.when_value)) {
      return operator === "between"
        ? "Enter a number for the start of the range"
        : "Enter the number to compare against";
    }
    if (operator === "between" && !isNumeric(config.when_value_to)) {
      return "Enter a number for the end of the range";
    }
  }
  if (DATE_OPERATORS.includes(operator)) {
    if (kinds[field] !== "date") return `"${label}" only works on a date field`;
    const amount = Number(String(config.when_value ?? "").trim());
    if (!isNumeric(config.when_value) || !Number.isInteger(amount) || amount < 0) {
      return "Enter a whole number of days or months (0 or more)";
    }
    if (config.when_unit !== undefined && config.when_unit !== "days" && config.when_unit !== "months") {
      return 'when_unit must be "days" or "months"';
    }
  }
  return null;
}

/** One-line help for the comparison currently picked. */
export function operatorHelp(operator: WorkflowWhenOperator, kind: WhenFieldKind | undefined): string {
  if (operator === "is_blank" || operator === "is_not_blank") {
    return "Checks only whether the field has been filled in. Empty text and an empty tag list both count as blank; 0 does not.";
  }
  if (operator === "between") {
    return "Matches when the number is between the two values, both ends included. A blank field never matches.";
  }
  if (NUMBER_OPERATORS.includes(operator)) {
    return "Compares the field's number against this value. A blank field never matches (it is not treated as 0).";
  }
  if (operator === "within_last") {
    return "Matches dates from N days/months ago up to today, both included (UTC calendar days). Pair it with a schedule to catch records as they move into the window.";
  }
  if (operator === "within_next") {
    return "Matches dates from today up to N days/months ahead, both included (UTC calendar days). Pair it with a schedule to catch records as they move into the window.";
  }
  if (kind === "number") return "Compares the field against the value. Number fields also offer greater/less than and range comparisons.";
  if (kind === "date") return "Compares the field against the value. Date fields also offer within the last/next N days or months.";
  return "Compares the field against the value. Number and date fields get extra comparisons once you name one.";
}
