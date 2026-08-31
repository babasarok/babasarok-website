import type { Field } from "../types.svelte";
import { findFieldByName, resolveFieldValue } from "./fieldValue";

/**
 * A field configured with `depends_on` is only shown when the referenced field
 * currently holds the required value (or, when no value is given, any value).
 * Keeping this in one place lets the order form, validation and pricing all
 * agree on which fields are active, so hidden fields drop out consistently.
 */
export function isFieldVisible(field: Field, fields: Field[]): boolean {
  const dependsOn = field.depends_on;
  if (!dependsOn?.field) {
    return true;
  }

  const target = findFieldByName(fields, dependsOn.field);
  if (!target) {
    return true;
  }

  const targetValue = resolveFieldValue(target);
  if (dependsOn.value) {
    switch (targetValue.kind) {
      case "string":
        return targetValue.value === dependsOn.value;
      case "boolean":
        return String(targetValue.value) === dependsOn.value;
      case "empty":
        return false;
    }
  }

  // No required value → visible as soon as the target holds any value.
  switch (targetValue.kind) {
    case "string":
      return true;
    case "boolean":
      return targetValue.value;
    case "empty":
      return false;
  }
}
