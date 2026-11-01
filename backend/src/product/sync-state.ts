import { createHash } from "node:crypto";
import type { ProductDefinition } from "@babasarok/product-definition";

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
}

/** The sync-owned slice of the native Vendure product, hashed for drift detection. */
export interface NativeProductState {
  slug: string;
  name: string;
  optionGroups: NativeOptionGroupState[];
  variants: NativeVariantState[];
}

/** JSON with recursively sorted object keys, so hash stability never depends on key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }

  if (value === undefined) {
    return "null";
  }

  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash of the canonical definition; changes whenever a commerce-relevant fact changes. */
export function definitionHash(definition: ProductDefinition): string {
  return sha256(canonicalJson(definition));
}

/**
 * Hash of the native state the sync owns (product name/slug, option groups
 * with their options, variant skus/names/prices and option assignments).
 * Canonicalized so presentation-order changes alone never read as drift.
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
      })),
  };

  return sha256(canonicalJson(canonical));
}
