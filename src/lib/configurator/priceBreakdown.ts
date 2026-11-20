/**
 * The configurator item's price *breakdown* for display: the base price plus one part
 * per visible, priced field. The authoritative unit/total price comes from the
 * shared pricing package (`liveUnitPrice`) — the same logic the server prices
 * orders with — so this module only decides which parts show and what each is
 * labelled.
 */
import type { ConfiguratorItem } from "@/lib/configurator/item.svelte";
import { isFieldVisible } from "@/lib/configurator/field";
import { FIELD_BEHAVIORS } from "@/lib/configurator/behavior";
import type { FieldPricePart } from "@/lib/configurator/behavior";

export interface PriceBreakdown {
  basePrice: Pick<FieldPricePart, "price">;
  options: FieldPricePart[];
  priced_by_length: false;
}

export interface LengthBasedBreakdown {
  basePrice: Pick<FieldPricePart, "price">;
  options: FieldPricePart[];
  priced_by_length: true;
  /** The per-meter price: base plus every visible field part except the length source. */
  per_meter_price: number | undefined;
}

function getFieldPrice(
  field: ConfiguratorItem["fields"][number],
  product: ConfiguratorItem
): FieldPricePart | undefined {
  // The length source carries no price of its own; it scales the per-meter
  // price (a product-level decision, so it stays with the caller).
  if (product.length_based_pricing && field.name === product.length_based_pricing.sourceField) {
    return undefined;
  }

  return FIELD_BEHAVIORS[field.type].price(field);
}

export function priceBreakdown(product: ConfiguratorItem): PriceBreakdown | LengthBasedBreakdown {
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

  const basePrice: Pick<FieldPricePart, "price"> = { price: product.price };

  if (product.length_based_pricing) {
    return {
      priced_by_length: true,
      options: parts,
      per_meter_price: Math.round(
        parts.reduce((sum, part) => sum + Math.round(part.price ?? 0), basePrice.price ?? 0)
      ),
      basePrice,
    };
  }

  return {
    options: parts,
    priced_by_length: false,
    basePrice,
  };
}
