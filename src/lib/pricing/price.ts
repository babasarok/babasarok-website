import type { IProduct, Field } from "../types.svelte";
import { isFieldVisible, findFieldByName, resolveNumericValue } from "../product/field";
import { FIELD_BEHAVIORS } from "../product/behavior";
import type { FieldPricePart } from "../product/behavior";

/**
 * A line's standalone product discount: the per-line multiplier, how many units
 * it applies to, and the raw percent. Set discounts are no longer folded into
 * the line; they are flat, basket-level deductions (see `setInstanceAmount`) and
 * stack on top of this standalone discount.
 */
interface DiscountInfo {
  discount: number;
  discountAppliedCount: number;
  /** Raw discount percent (e.g. 15 for 15%), independent of the applied count. */
  percent: number;
}

interface BasePrice {
  basePrice: FieldPricePart;
  options: FieldPricePart[];
  unitPrice: number | undefined;
  totalPrice: number | undefined;
  discountInfo: DiscountInfo | undefined;
}

export interface Price extends BasePrice {
  priced_by_length: false;
}

export interface LengthBasedPrice extends BasePrice {
  priced_by_length: true;
  length: number | undefined;
  per_meter_price: number | undefined;
}

function getFieldPrice(field: Field, product: IProduct): FieldPricePart | undefined {
  // The length source carries no price of its own; it scales the per-meter
  // price (a product-level decision, so it stays with the caller).
  if (product.length_based_pricing && field.name === product.length_based_pricing.sourceField) {
    return undefined;
  }

  return FIELD_BEHAVIORS[field.type].price(field);
}

export function calculatePriceForItem(product: IProduct): Price | LengthBasedPrice {
  const parts: FieldPricePart[] = [];
  for (const field of product.fields) {
    if (!isFieldVisible(field, product.fields)) {
      continue;
    }
    const fieldPrice = getFieldPrice(field, product);
    if (!fieldPrice) {
      continue;
    }
    parts.push(fieldPrice);
  }

  const basePrice: FieldPricePart = { label: "Alapár", price: product.price };
  const allParts = [basePrice, ...parts];
  const unitPrice = Math.round(
    allParts.reduce((sum, part) => sum + Math.round(part.price ?? 0), 0)
  );

  let discount: DiscountInfo | undefined;
  if (
    product.discount &&
    product.discount_valid_until &&
    new Date() <= new Date(product.discount_valid_until)
  ) {
    discount = {
      discount: 1 - product.discount / 100,
      discountAppliedCount: product.count,
      percent: product.discount,
    };
  }

  const totalPrice = Math.round(
    unitPrice * product.count * (discount === undefined ? 1 : discount.discount)
  );

  if (product.length_based_pricing) {
    // The source field is validated at build time (data.ts) and resolved to a
    // number via the typed accessor; a blank/non-numeric value → no length.
    const lengthSource = product.length_based_pricing.sourceField;
    if (!lengthSource) {
      return {
        priced_by_length: true,
        length: undefined,
        options: parts,
        unitPrice: undefined,
        per_meter_price: unitPrice,
        totalPrice: undefined,
        basePrice,
        discountInfo: discount,
      };
    }

    const field = findFieldByName(product.fields, lengthSource);
    const cm = resolveNumericValue(field);
    const length = cm === undefined ? undefined : cm / 100;

    return {
      priced_by_length: true,
      length,
      options: parts,
      unitPrice: length === undefined ? undefined : unitPrice * length,
      per_meter_price: unitPrice,
      totalPrice: length === undefined ? undefined : totalPrice * length,
      basePrice,
      discountInfo: discount,
    };
  }

  return {
    options: parts,
    unitPrice,
    totalPrice,
    priced_by_length: false,
    basePrice,
    discountInfo: discount,
  };
}
