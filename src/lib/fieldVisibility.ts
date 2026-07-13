import type { Field } from "./types.svelte";

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

  const target = fields.find((f) => f.name === dependsOn.field);
  if (!target) {
    return true;
  }

  const targetValue = target.value?.value;
  if (dependsOn.value) {
    return targetValue === dependsOn.value;
  }

  return !!targetValue;
}
