/**
 * The only site module reading a variant's native options (ADR 0019,
 * allowlisted in eslint/variant-option-reads.ts): ready-made products' option
 * groups and variants from the catalog, and a basket line's options.
 */
import { z } from "zod";
import type { LineRow } from "@/lib/basket/lineRows";
import type { ReadyMadeOrdering, ReadyMadeVariant } from "./readyMade";

export const CatalogOptionGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  options: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const CatalogVariantSchema = z.object({
  id: z.string(),
  currencyCode: z.string(),
  priceWithTax: z.number(),
  stockLevel: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"]),
  saleableStock: z.number().int().nullable(),
  options: z.array(z.object({ id: z.string() })),
});

export const LineVariantOptionsSchema = z.array(
  z.object({ name: z.string(), group: z.object({ name: z.string() }) })
);

type CatalogOptionGroup = z.output<typeof CatalogOptionGroupSchema>;
type CatalogVariant = z.output<typeof CatalogVariantSchema>;

function toVariant(variant: CatalogVariant): ReadyMadeVariant {
  return {
    id: variant.id,
    priceWithTax: variant.priceWithTax,
    saleableStock: variant.saleableStock,
    soldOut: variant.stockLevel === "OUT_OF_STOCK",
    optionIds: variant.options.map((option) => option.id),
  };
}

/** Null when no variant is in stock: a sold-out product is not a storefront product. */
export function toReadyMadeOrdering(row: {
  optionGroups: readonly CatalogOptionGroup[];
  variants: readonly CatalogVariant[];
}): ReadyMadeOrdering | null {
  const first = row.variants.at(0);
  const variants = row.variants.map((variant) => toVariant(variant));

  if (first === undefined || variants.every((variant) => variant.soldOut)) {
    return null;
  }

  const usedOptionIds = new Set(variants.flatMap((variant) => variant.optionIds));

  return {
    kind: "ready-made",
    currencyCode: first.currencyCode,
    optionGroups: row.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      options: group.options
        .filter((option) => usedOptionIds.has(option.id))
        .map((option) => ({ id: option.id, name: option.name })),
    })),
    variants,
  };
}

/** A ready-made basket line's options as "group: option" rows. */
export function variantOptionRows(variant: {
  options: z.output<typeof LineVariantOptionsSchema>;
}): LineRow[] {
  return variant.options.map((option) => ({ label: option.group.name, value: option.name }));
}
