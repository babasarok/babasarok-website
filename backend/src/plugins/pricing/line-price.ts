import type { ProductDefinition, ProductField } from "@babasarok/product-definition";
import { dependencyOrder, isVisible } from "../product/field-visibility";
import type { LineSelections } from "./line-selection";

export interface LinePricingInput {
  definition: ProductDefinition;
  /**
   * The variant's channel list price: base price plus every variant-axis
   * option (choices, toggles, material picks) as synced from the definition.
   * Zero on length-priced products, whose price the walk derives instead.
   */
  variantListPrice: number;
  /** Option-group code (the canonical field id) → chosen option code. */
  optionCodes: ReadonlyMap<string, string>;
  selections: LineSelections;
  /** The buyer-entered length in centimetres; null when not entered. */
  lengthCm: number | null;
}

export class LinePricingError extends Error {}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fieldById(fields: readonly ProductField[], id: string): ProductField | undefined {
  return fields.find((field) => field.id === id);
}

function choiceOptionPrice(
  field: Extract<ProductField, { kind: "choice" }>,
  optionId: string
): number {
  const option = field.options.find((candidate) => candidate.id === optionId);

  if (option === undefined) {
    throw new LinePricingError(
      `A(z) "${field.label}" mező nem kínálja ezt az értéket: ${optionId}`
    );
  }

  return option.price;
}

/**
 * The price a variant-axis field (non-color choice, toggle, material) contributes
 * for the variant's chosen option. Every generated variant carries an option per
 * such field, so a missing code means native drift.
 */
function variantAxisPrice(field: ProductField, optionCode: string | undefined): number {
  if (optionCode === undefined) {
    throw new LinePricingError(
      `A(z) "${field.id}" választása nincs rajta a kiválasztott változaton.`
    );
  }

  if (field.kind === "toggle") {
    return optionCode === "igen" ? field.price : 0;
  }

  if (field.kind === "material") {
    const option = field.options.find((candidate) => candidate.materialId === optionCode);

    if (option === undefined) {
      throw new LinePricingError(
        `A(z) "${field.label}" mező nem kínálja ezt az anyagot: ${optionCode}`
      );
    }

    return option.price;
  }

  if (field.kind === "choice") {
    return choiceOptionPrice(field, optionCode);
  }

  return 0;
}

/**
 * The unit price of a configured order line in whole forints, computed from
 * the product definition and the line's selections (order-pricing spec).
 *
 * Non-length products start from the variant's synced list price — base price
 * plus every variant-axis option — and add what never becomes a variant axis:
 * color-choice picks, visible input fields (their price applies even while
 * empty), and embroidery (flat, or per word of the entered text).
 *
 * Length-priced products walk the definition instead (their variants sit at
 * 0 Ft): base price plus every variant-axis option price by matching option
 * codes, with the length source field skipped — it carries no price, it
 * scales — and the sum multiplied by the length in metres.
 *
 * Throws {@link LinePricingError} for an unpriced line: a missing length,
 * selections that reference unknown fields or disagree with the variant's
 * options (drift or a buggy storefront), or a custom value on a field the
 * variant matrix carries.
 */
export function computeLineUnitPrice(input: LinePricingInput): number {
  const { definition, variantListPrice, optionCodes, selections } = input;

  for (const [fieldId, selection] of Object.entries(selections)) {
    const field = fieldById(definition.fields, fieldId);

    if (field === undefined) {
      throw new LinePricingError(`A termék nem ismeri ezt a mezőt: ${fieldId}`);
    }

    if (selection.kind === "material") {
      const optionCode = optionCodes.get(fieldId);

      if (optionCode === undefined) {
        throw new LinePricingError(
          `A(z) "${fieldId}" anyagválasztása nincs rajta a kiválasztott változaton.`
        );
      }

      if (selection.materialId !== optionCode) {
        throw new LinePricingError(
          `A(z) "${fieldId}" anyagválasztása nem egyezik a kiválasztott változattal.`
        );
      }
    }

    if (
      field.kind === "choice" &&
      field.presentation !== "color" &&
      (selection.kind === "custom" || selection.kind === "option") &&
      selection.value !== optionCodes.get(fieldId)
    ) {
      // A custom value cannot select a generated variant: the matrix only
      // carries the listed options. Refuse to price rather than sell it.
      throw new LinePricingError(
        `A(z) "${field.label}" mező választása nem egyezik a kiválasztott változattal, az egyedi értéket a változat-mátrix nem tudja árazni.`
      );
    }
  }

  const sourceFieldId =
    definition.pricing.kind === "length" ? definition.pricing.sourceFieldId : undefined;

  const { order, cyclic } = dependencyOrder(definition.fields);
  const knownFieldIds = new Set(definition.fields.map((field) => field.id));
  const values = new Map<string, string | boolean>();
  const isVariantAxis = (field: ProductField): boolean =>
    field.kind === "material" ||
    field.kind === "toggle" ||
    (field.kind === "choice" && field.presentation !== "color");

  for (const field of order) {
    if (field.id === sourceFieldId) {
      continue;
    }

    let value: string | boolean | undefined;

    if (isVariantAxis(field)) {
      const optionCode = optionCodes.get(field.id);

      if (optionCode === undefined) {
        throw new LinePricingError(
          `A(z) "${field.id}" választása nincs rajta a kiválasztott változaton.`
        );
      }

      value = field.kind === "toggle" ? optionCode === "igen" : optionCode;
    } else if (field.kind === "input") {
      const selection = selections[field.id];

      value = selection?.kind === "input" ? selection.value : undefined;
    } else if (field.kind === "choice") {
      const selection = selections[field.id];

      value =
        selection !== undefined && (selection.kind === "option" || selection.kind === "custom")
          ? selection.value
          : undefined;
    }

    if (value !== undefined) {
      values.set(field.id, value);
    }
  }

  const lineParts: number[] = [];

  for (const field of order) {
    if (field.id === sourceFieldId) {
      continue;
    }

    if (!isVisible(field, cyclic, knownFieldIds, values)) {
      continue;
    }

    if (field.kind === "input") {
      lineParts.push(field.price);
      continue;
    }

    if (field.kind === "embroidery") {
      const selection = selections[field.id];

      if (selection?.kind !== "embroidery") {
        continue;
      }

      lineParts.push(
        field.pricing.kind === "flat"
          ? field.pricing.price
          : field.pricing.pricePerWord * countWords(selection.text)
      );
      continue;
    }

    if (field.kind === "choice" && field.presentation === "color") {
      const selection = selections[field.id];

      if (selection?.kind === "option") {
        lineParts.push(choiceOptionPrice(field, selection.value));
      }

      continue;
    }
  }

  if (definition.pricing.kind === "length") {
    const lengthCm = input.lengthCm;

    if (lengthCm === null || !Number.isInteger(lengthCm) || lengthCm <= 0) {
      throw new LinePricingError(
        `A(z) "${definition.label}" méteráru, de a rendelési soron nincs hossz megadva.`
      );
    }

    const perMeter =
      definition.basePrice +
      order.reduce(
        (sum, field) =>
          field.id === sourceFieldId || !isVariantAxis(field)
            ? sum
            : sum + variantAxisPrice(field, optionCodes.get(field.id)),
        0
      );

    return Math.round(
      (perMeter + lineParts.reduce((sum, part) => sum + part, 0)) * (lengthCm / 100)
    );
  }

  return Math.round(variantListPrice + lineParts.reduce((sum, part) => sum + part, 0));
}
