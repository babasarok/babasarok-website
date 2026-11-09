import {
  resolveText,
  type ProductDefinition,
  type ProductField,
} from "../product-definition/index";
import { dependencyOrder, isVisible } from "../product-definition/index";
import type { LineSelections } from "../product-definition/index";
import { messages } from "../messages";
import { axisCodes, isAxisField, type AxisCodes, type AxisField } from "./axis-codes";

export interface LinePricingInput {
  definition: ProductDefinition;
  /** The native product's name, which buyer-facing messages call it by. */
  productName: string;
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

/** The price a axis field contributes for the chosen option code. */
function axisPrice(field: AxisField, optionCode: string, languageCode: string): number {
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

  return choiceOptionPrice(field, optionCode, languageCode);
}

/**
 * The unit price of a configured order line in whole forints, computed from
 * the product definition and the line's selections (order-pricing spec). The
 * axis fields price at the codes {@link axisCodes} reads from the
 * selections.
 *
 * Non-length products: base price plus every axis option visible
 * given the axis picks alone, plus color-choice picks, visible input fields
 * (their price applies even while empty), and embroidery (flat, or per word
 * of the entered text).
 *
 * Length-priced products: base price plus every axis option visible
 * given all picks, with the length source field skipped — it carries no
 * price, it scales — plus the same extras, multiplied by the length in metres.
 *
 * Throws {@link LinePricingError} for an unpriced line: a missing length, a
 * selection of an unknown field, or one its field does not offer.
 */
export function computeLineUnitPrice(input: LinePricingInput): number {
  const { definition, productName, selections, languageCode } = input;

  for (const fieldId of Object.keys(selections)) {
    if (fieldById(definition.fields, fieldId) === undefined) {
      throw new LinePricingError(messages(languageCode).unknownField(fieldId));
    }
  }

  const derived = axisCodes(definition, selections, languageCode);

  if (!derived.ok) {
    throw new LinePricingError(derived.message);
  }

  const codes = derived.codes;
  const sourceFieldId =
    definition.pricing.kind === "length" ? definition.pricing.sourceFieldId : undefined;

  const { order, cyclic } = dependencyOrder(definition.fields);
  const knownFieldIds = new Set(definition.fields.map((field) => field.id));
  const axisValues = new Map<string, string | boolean>();
  const values = new Map<string, string | boolean>();

  for (const field of order) {
    const value = fieldValue(field, codes, selections);

    if (value === undefined) {
      continue;
    }

    if (isAxisField(field)) {
      axisValues.set(field.id, value);
    }

    if (field.id !== sourceFieldId) {
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

  const extras = lineParts.reduce((sum, part) => sum + part, 0);

  if (definition.pricing.kind === "length") {
    const lengthCm = input.lengthCm;

    if (lengthCm === null || !Number.isInteger(lengthCm) || lengthCm <= 0) {
      throw new LinePricingError(lengthMissingRejection(productName, languageCode));
    }

    const perMeter =
      definition.basePrice +
      axisSum(
        order,
        codes,
        languageCode,
        (field) => field.id !== sourceFieldId && isVisible(field, cyclic, knownFieldIds, values)
      );

    return Math.round((perMeter + extras) * (lengthCm / 100));
  }

  const axisTotal = axisSum(order, codes, languageCode, (field) =>
    isVisible(field, cyclic, knownFieldIds, axisValues)
  );

  return Math.round(definition.basePrice + axisTotal + extras);
}

function fieldValue(
  field: ProductField,
  codes: AxisCodes,
  selections: LineSelections
): string | boolean | undefined {
  const selection = selections[field.id];

  if (field.kind === "input") {
    return selection?.kind === "input" ? selection.value : undefined;
  }

  if (field.kind === "choice" && field.presentation === "color") {
    if (selection?.kind === "option" || selection?.kind === "custom") {
      return selection.value;
    }

    return undefined;
  }

  if (!isAxisField(field)) {
    return undefined;
  }

  const code = codes.get(field.id);

  if (field.kind === "toggle") {
    return code === "igen";
  }

  return code;
}

function axisSum(
  fields: readonly ProductField[],
  codes: AxisCodes,
  languageCode: string,
  counts: (field: AxisField) => boolean
): number {
  let sum = 0;

  for (const field of fields) {
    if (!isAxisField(field) || !counts(field)) {
      continue;
    }

    const code = codes.get(field.id);

    if (code === undefined) {
      continue;
    }

    sum += axisPrice(field, code, languageCode);
  }

  return sum;
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
