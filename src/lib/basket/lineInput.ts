import type { ProductDefinition } from "@babasarok/product-definition";
import { axisCodes, serializeLineSelections, type LineSelections } from "@babasarok/pricing";
import { isFieldVisible } from "@/lib/product/field";
import type { Field } from "@/lib/types.svelte";
import type { VariantOptions } from "./api";

export interface ConfiguredLine {
  variantId: string;
  selections: string;
  lengthCm: number | undefined;
}

export type LineBuild = { ok: true; line: ConfiguredLine } | { ok: false; message: string };

export const UNAVAILABLE_COMBINATION =
  "Ez a beállítás-kombináció jelenleg nem rendelhető. Töltsd újra az oldalt, hátha változott a kínálat.";

function selectionFor(field: Field): LineSelections[string] {
  switch (field.type) {
    case "input":
      return field.value?.value ? { kind: "input", value: field.value.value } : undefined;
    case "select":
    case "radio":
    case "color": {
      const value = field.value;

      if (!value?.value) {
        return undefined;
      }

      return value.is_custom
        ? { kind: "custom", value: value.value }
        : { kind: "option", value: value.value };
    }
    case "toggle":
      return { kind: "option", value: field.value?.value === true ? "igen" : "nem" };
    case "material":
      return field.value && field.value.material_id !== ""
        ? { kind: "material", materialId: field.value.material_id, colors: field.value.colors }
        : undefined;
    case "embroidery":
      return field.value?.enabled
        ? { kind: "embroidery", text: field.value.text.value, colorId: field.value.color.color }
        : undefined;
  }
}

export function buildSelections(fields: Field[]): LineSelections {
  const selections: LineSelections = {};

  for (const field of fields) {
    const selection = isFieldVisible(field, fields) ? selectionFor(field) : undefined;

    if (selection !== undefined) {
      selections[field.name] = selection;
    }
  }

  return selections;
}

function enteredValue(field: Field | undefined): string | undefined {
  switch (field?.type) {
    case "select":
    case "radio":
    case "input":
    case "color":
      return field.value?.value;
    case "toggle":
      return field.value?.value === true ? "igen" : "nem";
    case "material":
      return field.value?.material_id;
    default:
      return undefined;
  }
}

export function pickVariant(
  definition: ProductDefinition,
  fields: Field[],
  variants: readonly VariantOptions[]
): VariantOptions | undefined {
  const derived = axisCodes(definition, buildSelections(fields), "hu");

  if (!derived.ok) {
    return undefined;
  }

  const wanted = [...derived.codes];

  return variants.find((variant) =>
    wanted.every(([group, code]) =>
      variant.options.some((option) => option.group === group && option.code === code)
    )
  );
}

function lengthOf(definition: ProductDefinition, fields: Field[]): number | undefined {
  if (definition.pricing.kind !== "length") {
    return undefined;
  }

  const sourceId = definition.pricing.sourceFieldId;
  const length = Math.round(
    Number(enteredValue(fields.find((candidate) => candidate.name === sourceId)))
  );

  return Number.isNaN(length) ? undefined : length;
}

export function buildLine(
  definition: ProductDefinition,
  fields: Field[],
  variants: readonly VariantOptions[]
): LineBuild {
  const variant = pickVariant(definition, fields, variants);

  if (variant === undefined) {
    return { ok: false, message: UNAVAILABLE_COMBINATION };
  }

  return {
    ok: true,
    line: {
      variantId: variant.id,
      selections: serializeLineSelections(buildSelections(fields)),
      lengthCm: lengthOf(definition, fields),
    },
  };
}

export function applySelections(fields: Field[], selections: LineSelections): void {
  for (const field of fields) {
    const selection = selections[field.name];

    if (selection === undefined) {
      continue;
    }

    switch (field.type) {
      case "input":
        if (selection.kind === "input") {
          field.value = { value: selection.value };
        }
        break;
      case "select":
      case "radio":
      case "color":
        if (selection.kind === "option" || selection.kind === "custom") {
          field.value = { value: selection.value, is_custom: selection.kind === "custom" };
        }
        break;
      case "toggle":
        if (selection.kind === "option") {
          field.value = { value: selection.value === "igen" };
        }
        break;
      case "material":
        if (selection.kind === "material") {
          field.value = { material_id: selection.materialId, colors: [...selection.colors] };
        }
        break;
      case "embroidery":
        if (selection.kind === "embroidery") {
          field.value = {
            enabled: true,
            text: { value: selection.text },
            color: { color: selection.colorId },
          };
        }
        break;
    }
  }
}
