/**
 * Single source of truth for product `type` values (the product list's
 * classification dimension — see CONTEXT.md).
 *
 * Consumed by the Tina product collection (the `type` select options), the
 * Astro content schema (`z.enum`) and `data.ts` (runtime narrowing). Add a
 * new type here once and every consumer picks it up.
 */
import { defaultLocale, type Locale } from "@/lib/i18n";

export const PRODUCT_TYPES = [
  { value: "racsvedo", label: "Rácsvédő", labelEn: "Cot rail cover" },
  { value: "takaro", label: "Takaró", labelEn: "Blanket" },
  { value: "lepedo", label: "Lepedő / fektető", labelEn: "Sheet" },
  { value: "parna", label: "Párna", labelEn: "Pillow" },
  { value: "babafeszek", label: "Babafészek", labelEn: "Baby nest" },
  { value: "zsak", label: "Zsák és tároló", labelEn: "Bag and storage" },
  { value: "kiegeszito", label: "Kiegészítő", labelEn: "Accessories" },
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number]["value"];

/** Just the values, as a non-empty tuple for `z.enum`. */
export const PRODUCT_TYPE_VALUES = PRODUCT_TYPES.map((t) => t.value) as [
  ProductType,
  ...ProductType[],
];

/** Human label for a product type value. */
export function productTypeLabel(type: ProductType, locale: Locale = defaultLocale): string {
  const entry = PRODUCT_TYPES.find((t) => t.value === type);
  if (!entry) {
    return type;
  }
  return locale === defaultLocale ? entry.label : entry.labelEn;
}

export function isProductType(type: string): type is ProductType {
  return (PRODUCT_TYPE_VALUES as readonly string[]).includes(type);
}
