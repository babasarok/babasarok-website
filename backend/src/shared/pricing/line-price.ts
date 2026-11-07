import {
  resolveText,
  type ProductDefinition,
  type ProductField,
} from "../product-definition/index";
import { dependencyOrder, isVisible } from "../product-definition/index";
import type { LineSelections } from "../product-definition/index";
import { messages } from "../messages";

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

export function lengthMissingRejection(productName: string, languageCode: string): string {
  return messages(languageCode).lengthMissing(productName);
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
      messages(languageCode).fieldDoesNotOfferValue(
        resolveText(field.label, languageCode),
        optionId
      )
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
    throw new LinePricingError(messages(languageCode).choiceNotOnVariant(field.id));
  }

  if (field.kind === "toggle") {
    return optionCode === "igen" ? field.price : 0;
  }

  if (field.kind === "material") {
    const option = field.options.find((candidate) => candidate.materialId === optionCode);

    if (option === undefined) {
      throw new LinePricingError(
        messages(languageCode).fieldDoesNotOfferMaterial(
          resolveText(field.label, languageCode),
          optionCode
        )
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
 * Throws {@link LinePricingError} for an unpriced line: a missing length,
 * selections that reference unknown fields or list an option that disagrees
 * with the variant's options (drift or a buggy storefront). A custom value on
 * a variant-axis field prices via the variant's pinned option — the
 * storefront cannot put it on the variant matrix, so it pins a listed option
 * and stores the custom text on the line.
 */
export function computeLineUnitPrice(input: LinePricingInput): number {
  const { definition, productName, variantListPrice, optionCodes, selections, languageCode } =
    input;

  for (const [fieldId, selection] of Object.entries(selections)) {
    if (selection === undefined) {
      continue;
    }

    const field = fieldById(definition.fields, fieldId);

    if (field === undefined) {
      throw new LinePricingError(messages(languageCode).unknownField(fieldId));
    }

    if (selection.kind === "material") {
      const optionCode = optionCodes.get(fieldId);

      if (optionCode === undefined) {
        throw new LinePricingError(messages(languageCode).materialChoiceNotOnVariant(fieldId));
      }

      if (selection.materialId !== optionCode) {
        throw new LinePricingError(messages(languageCode).materialChoiceMismatch(fieldId));
      }
    }

    if (
      field.kind === "choice" &&
      field.presentation !== "color" &&
      selection.kind === "option" &&
      selection.value !== optionCodes.get(fieldId)
    ) {
      // A listed option the variant doesn't carry is drift or a buggy
      // storefront — refuse to price. A custom value cannot be in the matrix:
      // the storefront pins a listed variant for it and stores the custom
      // text on the line, and the line prices via the variant's option code —
      // exactly what the live price showed.
      throw new LinePricingError(
        messages(languageCode).choiceMismatch(resolveText(field.label, languageCode))
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
        throw new LinePricingError(messages(languageCode).choiceNotOnVariant(field.id));
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
      throw new LinePricingError(lengthMissingRejection(productName, languageCode));
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
        message: messages(input.languageCode).pricingFailure(input.productName, error.message),
      };
    }

    throw error;
  }
}
