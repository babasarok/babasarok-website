import { z } from "zod";
import type { LineRow } from "@/lib/basket/lineRows";

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

export interface ReadyMadeOption {
  id: string;
  name: string;
}

export interface ReadyMadeOptionGroup {
  id: string;
  name: string;
  options: ReadyMadeOption[];
}

export interface ReadyMadeVariant {
  id: string;
  priceWithTax: number;
  /** Real stock the storefront may show and cap the quantity at; null when untracked. */
  saleableStock: number | null;
  soldOut: boolean;
  optionIds: string[];
}

/** A product ordered as-is: one of its variants, picked by its options when it has option groups. */
export interface ReadyMadeOrdering {
  kind: "ready-made";
  currencyCode: string;
  /** Only the options some variant carries; empty for a single-variant product. */
  optionGroups: ReadyMadeOptionGroup[];
  /** The live variants, sold-out ones included; at least one is in stock. */
  variants: ReadyMadeVariant[];
}

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

/** The product's stock across its in-stock variants; null when any of them is untracked. */
export function totalStock(ordering: ReadyMadeOrdering): number | null {
  let total = 0;

  for (const variant of ordering.variants.filter((candidate) => !candidate.soldOut)) {
    if (variant.saleableStock === null) {
      return null;
    }

    total += variant.saleableStock;
  }

  return total;
}

/** The preferred variant (e.g. a basket line's) while it is in stock, otherwise the first in stock. */
export function initialVariant(
  ordering: ReadyMadeOrdering,
  preferredId?: string
): ReadyMadeVariant | undefined {
  const preferred = ordering.variants.find(
    (variant) => variant.id === preferredId && !variant.soldOut
  );

  return preferred ?? ordering.variants.find((variant) => !variant.soldOut);
}

/** An option the buyer can pick: some in-stock variant carries it. */
export function isOptionAvailable(ordering: ReadyMadeOrdering, optionId: string): boolean {
  return ordering.variants.some(
    (variant) => !variant.soldOut && variant.optionIds.includes(optionId)
  );
}

/**
 * The variant picking `optionId` leads to: of the in-stock variants carrying
 * it, the one keeping the most of the current variant's other options, so a
 * pick never lands on a combination that does not exist or is sold out.
 */
export function variantForOption(
  ordering: ReadyMadeOrdering,
  current: ReadyMadeVariant | undefined,
  optionId: string
): ReadyMadeVariant | undefined {
  const kept = new Set(current?.optionIds);
  let best: { variant: ReadyMadeVariant; shared: number } | undefined;

  for (const variant of ordering.variants) {
    if (variant.soldOut || !variant.optionIds.includes(optionId)) {
      continue;
    }

    const shared = variant.optionIds.filter((id) => kept.has(id)).length;

    if (best === undefined || shared > best.shared) {
      best = { variant, shared };
    }
  }

  return best?.variant;
}

/** A ready-made basket line's options as "group: option" rows. */
export function variantOptionRows(variant: {
  options: z.output<typeof LineVariantOptionsSchema>;
}): LineRow[] {
  return variant.options.map((option) => ({ label: option.group.name, value: option.name }));
}
