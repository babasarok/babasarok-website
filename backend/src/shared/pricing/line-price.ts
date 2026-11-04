import {
  resolveText,
  type ProductDefinition,
  type ProductField,
} from "../product-definition/index";
import { dependencyOrder, isVisible } from "./field-visibility.js";
import type { LineSelections } from "./line-selection.js";

export interface LinePricingInput {
  definition: ProductDefinition;
  /** The native product's name, which buyer-facing messages call it by. */
  productName: string;
  /**
   * The variant's channel list price: base price plus every visible variant-axis
   * option (choices, toggles, material picks) as synced from the definition.
   * Zero on length-priced products, whose price the walk derives instead.
   */
  variantListPrice: number;
  /** Option-group code (the canonical field id) → chosen option code. */
  optionCodes: ReadonlyMap<string, string>;
  selections: LineSelections;
  /** The buyer-entered length in centimetres; null when not entered. */
  lengthCm: number | null;
  /** The request language the rejection messages name fields in. */
  languageCode: string;
}

export class LinePricingError extends Error {}

/**
 * The rejection for ordering a non-orderable (browse-only) product: the
 * interceptor returns it at the mutation boundary, the pricing walk throws it
 * as the backstop (ADR 0011 decision 5).
 */
export function nonOrderableRejection(productName: string): string {
  return `A(z) "${productName}" termék jelenleg nem rendelhető.`;
}

export function lengthMissingRejection(productName: string): string {
  return `A(z) "${productName}" méteráru — a hossz (cm) megadása kötelező.`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fieldById(fields: readonly ProductField[], id: string): ProductField | undefined {
  return fields.find((field) => field.id === id);
}

function choiceOptionPrice(
  field: Extract<ProductField, { kind: "choice" }>,
  optionId: string,
  languageCode: string
): number {
  const option = field.options.find((candidate) => candidate.id === optionId);

  if (option === undefined) {
    throw new LinePricingError(
      `A(z) "${resolveText(field.label, languageCode)}" mező nem kínálja ezt az értéket: ${optionId}`
    );
  }

  return option.price;
}

/**
 * The price a variant-axis field (non-color choice, toggle, material) contributes
 * for the variant's chosen option. Every generated variant carries an option per
 * such field, so a missing code means native drift.
 */
function variantAxisPrice(
  field: ProductField,
  optionCode: string | undefined,
  languageCode: string
): number {
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
        `A(z) "${resolveText(field.label, languageCode)}" mező nem kínálja ezt az anyagot: ${optionCode}`
      );
    }

    return option.price;
  }

  if (field.kind === "choice") {
    return choiceOptionPrice(field, optionCode, languageCode);
  }

  return 0;
}

/**
 * The unit price of a configured order line in whole forints, computed from
 * the product definition and the line's selections (order-pricing spec).
 *
 * Non-length products start from the variant's synced list price — base price
 * plus every visible variant-axis option — and add what never becomes a variant
 * axis: color-choice picks, visible input fields (their price applies even while
 * empty), and embroidery (flat, or per word of the entered text).
 *
 * Length-priced products walk the definition instead (their variants sit at
 * 0 Ft): base price plus every variant-axis option price visible given the
 * variant's picks — matching the synced matrix — with the length source field
 * skipped — it carries no price, it scales — and the sum multiplied by the
 * length in metres.
 *
 * Throws {@link LinePricingError} for an unpriced line: a non-orderable
 * product, a missing length, selections that reference unknown fields or
 * disagree with the variant's options (drift or a buggy storefront), or a
 * custom value on a field the variant matrix carries.
 */
export function computeLineUnitPrice(input: LinePricingInput): number {
  const { definition, productName, variantListPrice, optionCodes, selections, languageCode } =
    input;

  if (!definition.orderable) {
    throw new LinePricingError(nonOrderableRejection(productName));
  }

  for (const [fieldId, selection] of Object.entries(selections)) {
    if (selection === undefined) {
      continue;
    }

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
        `A(z) "${resolveText(field.label, languageCode)}" mező választása nem egyezik a kiválasztott változattal, az egyedi értéket a változat-mátrix nem tudja árazni.`
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
        lineParts.push(choiceOptionPrice(field, selection.value, languageCode));
      }

      continue;
    }
  }

  if (definition.pricing.kind === "length") {
    const lengthCm = input.lengthCm;

    if (lengthCm === null || !Number.isInteger(lengthCm) || lengthCm <= 0) {
      throw new LinePricingError(lengthMissingRejection(productName));
    }

    const perMeter =
      definition.basePrice +
      order.reduce(
        (sum, field) =>
          field.id === sourceFieldId ||
          !isVariantAxis(field) ||
          !isVisible(field, cyclic, knownFieldIds, values)
            ? sum
            : sum + variantAxisPrice(field, optionCodes.get(field.id), languageCode),
        0
      );

    return Math.round(
      (perMeter + lineParts.reduce((sum, part) => sum + part, 0)) * (lengthCm / 100)
    );
  }

  return Math.round(variantListPrice + lineParts.reduce((sum, part) => sum + part, 0));
}

export type LineValuation =
  { kind: "priced"; price: number } | { kind: "invalid"; message: string };

export function valueConfiguredLine(input: LinePricingInput): LineValuation {
  try {
    return { kind: "priced", price: computeLineUnitPrice(input) };
  } catch (error) {
    if (error instanceof LinePricingError) {
      return {
        kind: "invalid",
        message: `Árazási hiba (${input.productName}): ${error.message}`,
      };
    }

    throw error;
  }
}
