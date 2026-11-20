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
