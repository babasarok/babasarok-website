import {
  resolveText,
  type ProductDefinition,
  type ProductField,
} from "../product-definition/index";
import type { LineSelectionRecord, LineSelections } from "../product-definition/index";

export type AxisField =
  | Extract<ProductField, { kind: "toggle" }>
  | Extract<ProductField, { kind: "material" }>
  | Extract<ProductField, { kind: "choice" }>;

/** Field id → the option code the line picks on that axis field. */
export type AxisCodes = ReadonlyMap<string, string>;

export type AxisCodesResult = { ok: true; codes: AxisCodes } | { ok: false; message: string };

type AxisCodeResult = { ok: true; code: string } | { ok: false; message: string };

/** Non-color choices, toggles and materials: the fields that always resolve to one listed option. */
export function isAxisField(field: ProductField): field is AxisField {
  return (
    field.kind === "material" ||
    field.kind === "toggle" ||
    (field.kind === "choice" && field.presentation !== "color")
  );
}

function notOffered(field: AxisField, value: string, languageCode: string): AxisCodeResult {
  const noun = field.kind === "material" ? "anyagot" : "értéket";

  return {
    ok: false,
    message: `A(z) "${resolveText(field.label, languageCode)}" mező nem kínálja ezt az ${noun}: ${value}`,
  };
}

function defaultCode(field: AxisField): string | undefined {
  if (field.kind === "toggle") {
    return "nem";
  }

  if (field.kind === "material") {
    return field.options.at(0)?.materialId;
  }

  return field.options.at(0)?.id;
}

function defaultAxisCode(field: AxisField, languageCode: string): AxisCodeResult {
  const code = defaultCode(field);

  if (code === undefined) {
    return {
      ok: false,
      message: `A(z) "${resolveText(field.label, languageCode)}" mezőnek nincs választható értéke.`,
    };
  }

  return { ok: true, code };
}

function axisCode(
  field: AxisField,
  selection: LineSelectionRecord | undefined,
  languageCode: string
): AxisCodeResult {
  if (selection === undefined) {
    return defaultAxisCode(field, languageCode);
  }

  if (field.kind === "toggle") {
    if (selection.kind === "option" && (selection.value === "igen" || selection.value === "nem")) {
      return { ok: true, code: selection.value };
    }

    return notOffered(field, JSON.stringify(selection), languageCode);
  }

  if (field.kind === "material") {
    if (selection.kind !== "material") {
      return notOffered(field, JSON.stringify(selection), languageCode);
    }

    const offered = field.options.some((option) => option.materialId === selection.materialId);

    if (!offered) {
      return notOffered(field, selection.materialId, languageCode);
    }

    return { ok: true, code: selection.materialId };
  }

  if (selection.kind === "custom") {
    const listed = field.options.find((option) => option.id === selection.value);

    if (listed === undefined) {
      return defaultAxisCode(field, languageCode);
    }

    return { ok: true, code: listed.id };
  }

  if (selection.kind !== "option") {
    return notOffered(field, JSON.stringify(selection), languageCode);
  }

  if (!field.options.some((option) => option.id === selection.value)) {
    return notOffered(field, selection.value, languageCode);
  }

  return { ok: true, code: selection.value };
}

/**
 * The option code of every axis field, read from the line's
 * selections. A field without a selection takes the configurator's default —
 * `nem` for a toggle, the first listed option otherwise — and so does a
 * custom value that names no listed option. A selection the field does not
 * offer is refused.
 */
export function axisCodes(
  definition: ProductDefinition,
  selections: LineSelections,
  languageCode: string
): AxisCodesResult {
  const codes = new Map<string, string>();

  for (const field of definition.fields) {
    if (!isAxisField(field)) {
      continue;
    }

    const result = axisCode(field, selections[field.id], languageCode);

    if (!result.ok) {
      return result;
    }

    codes.set(field.id, result.code);
  }

  return { ok: true, codes };
}
