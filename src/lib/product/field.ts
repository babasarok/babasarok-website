import type { Field } from "../types.svelte";

/**
 * The value a product field currently holds, tagged by `kind` so consumers
 * narrow on it instead of coercing a raw string. Replaces the scattered
 * `FRAGILE` string→number / value→string reinterpretations that used to live in
 * priceUtils / materialUtils / fieldVisibility (issue #15).
 *
 * `embroidery` fields carry no scalar the rest of the form can reference, so
 * they resolve to `empty`; a blank string also collapses to `empty`.
 */
export type ResolvedFieldValue =
  { kind: "empty" } | { kind: "string"; value: string } | { kind: "boolean"; value: boolean };

/** Look up a sibling field by its `name` (the id used in cross-field references). */
export function findFieldByName(fields: Field[], name: string): Field | undefined {
  return fields.find((f) => f.name === name);
}

/** Resolve a field's stored value into the tagged {@link ResolvedFieldValue}. */
export function resolveFieldValue(field: Field | undefined): ResolvedFieldValue {
  if (!field) {
    return { kind: "empty" };
  }

  switch (field.type) {
    case "toggle": {
      const value = field.value?.value;
      return value === undefined ? { kind: "empty" } : { kind: "boolean", value };
    }
    case "embroidery": {
      return { kind: "empty" };
    }
    default: {
      const value = field.value?.value;
      return typeof value === "string" && value !== ""
        ? { kind: "string", value }
        : { kind: "empty" };
    }
  }
}

/**
 * Resolve a field reference to a number, or `undefined` when the field is
 * missing, empty, non-numeric, or holds a non-string value (toggle/embroidery).
 * Cross-field references validated at build time in `data.ts` guarantee the
 * name resolves; this narrows the value itself.
 */
export function resolveNumericValue(field: Field | undefined): number | undefined {
  const resolved = resolveFieldValue(field);
  if (resolved.kind !== "string") {
    return undefined;
  }
  const parsed = Number.parseFloat(resolved.value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

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
