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
