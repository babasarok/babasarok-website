import { canonicalJson } from "@babasarok/product-definition";
import { createHash } from "node:crypto";

export interface NativeOptionState {
  code: string;
  name: string;
}

export interface NativeOptionGroupState {
  code: string;
  name: string;
  options: NativeOptionState[];
}

/** One variant option pick, keyed by its group so group order cannot mask drift. */
export interface NativeVariantOptionState {
  groupCode: string;
  optionCode: string;
}

export interface NativeVariantState {
  sku: string;
  name: string;
  price: number;
  options: NativeVariantOptionState[];
  facetValues: string[];
}

/** The sync-owned slice of the native Vendure product, hashed for drift detection. */
export interface NativeProductState {
  slug: string;
  name: string;
  optionGroups: NativeOptionGroupState[];
  variants: NativeVariantState[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Hash of the native state the sync owns (product name/slug, option groups
 * with their options, variant skus/names/prices, option assignments and
 * facet values). Canonicalized so presentation-order changes alone never
 * read as drift.
 */
export function nativeStateHash(state: NativeProductState): string {
  const canonical = {
    slug: state.slug,
    name: state.name,
    optionGroups: [...state.optionGroups]
      .toSorted((a, b) => a.code.localeCompare(b.code))
      .map((group) => ({
        code: group.code,
        name: group.name,
        options: [...group.options].toSorted((a, b) => a.code.localeCompare(b.code)),
      })),
    variants: [...state.variants]
      .toSorted((a, b) => a.sku.localeCompare(b.sku))
      .map((variant) => ({
        sku: variant.sku,
        name: variant.name,
        price: variant.price,
        options: [...variant.options].toSorted(
          (a, b) =>
            a.groupCode.localeCompare(b.groupCode) || a.optionCode.localeCompare(b.optionCode)
        ),
        facetValues: [...variant.facetValues].toSorted((a, b) => a.localeCompare(b)),
      })),
  };

  return sha256(canonicalJson(canonical));
}
