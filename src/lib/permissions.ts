import type { FieldPermission, UserRole } from "./types";

export function canEditField(
  role: UserRole,
  objectName: string,
  fieldName: string,
  permissions: FieldPermission[]
): boolean {
  if (role === "admin") return true;
  const specific = permissions.find(
    (p) => p.role === role && p.object_name === objectName && p.field_name === fieldName
  );
  if (specific) return specific.can_edit;
  const wildcard = permissions.find(
    (p) => p.role === role && p.object_name === objectName && p.field_name === "*"
  );
  return wildcard ? wildcard.can_edit : false;
}
