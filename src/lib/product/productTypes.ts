/**
 * Single source of truth for product `type` values (the product list's
 * classification dimension — see CONTEXT.md).
 *
 * Consumed by the Tina product collection (the `type` select options), the
 * Astro content schema (`z.enum`) and `data.ts` (runtime narrowing). Add a
 * new type here once and every consumer picks it up.
 */
export const PRODUCT_TYPES = [
  { value: "racsvedo", label: "Rácsvédő" },
  { value: "takaro", label: "Takaró" },
  { value: "lepedo", label: "Lepedő / fektető" },
  { value: "parna", label: "Párna" },
  { value: "babafeszek", label: "Babafészek" },
  { value: "zsak", label: "Zsák és tároló" },
  { value: "kiegeszito", label: "Kiegészítő" },
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number]["value"];

/** Just the values, as a non-empty tuple for `z.enum`. */
export const PRODUCT_TYPE_VALUES = PRODUCT_TYPES.map((t) => t.value) as [
  ProductType,
  ...ProductType[],
];

/** Human label for a product type value. */
export function productTypeLabel(type: ProductType): string {
  return PRODUCT_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function isProductType(type: string): type is ProductType {
  return (PRODUCT_TYPE_VALUES as readonly string[]).includes(type);
}
