/**
 * Single source of truth for product field `type` values.
 *
 * Consumed by the Tina product collection (the `type` select options), the
 * Astro content schema (`z.enum`) and `data.ts` (runtime narrowing + the
 * `CmsField` discriminant). Add a new field type here once and every consumer
 * picks it up; the derived `ProductFieldType` keeps exhaustiveness honest.
 */
export const PRODUCT_FIELD_TYPES = [
  { value: "input", label: "Szöveg" },
  { value: "select", label: "Legördülő" },
  { value: "radio", label: "Gombos - egyválasztós" },
  { value: "color", label: "Szín" },
  { value: "toggle", label: "Igen/Nem" },
  { value: "embroidery", label: "Hímzés" },
] as const;

export const EMBROIDERY_PRICE_UNITS = [
  { value: "flat", label: "Fix ár" },
  { value: "word", label: "Szavanként" },
] as const;

export type ProductFieldType = (typeof PRODUCT_FIELD_TYPES)[number]["value"];
export type EmbroideryPriceUnit = (typeof EMBROIDERY_PRICE_UNITS)[number]["value"];

/** Just the values, as a non-empty tuple for `z.enum`. */
export const PRODUCT_FIELD_TYPE_VALUES = PRODUCT_FIELD_TYPES.map((t) => t.value) as [
  ProductFieldType,
  ...ProductFieldType[],
];

export const EMBROIDERY_PRICE_UNIT_VALUES = EMBROIDERY_PRICE_UNITS.map((t) => t.value) as [
  EmbroideryPriceUnit,
  ...EmbroideryPriceUnit[],
];

/** Type guard narrowing Tina's loose `type: string` to a known field type. */
export function isProductFieldType(type: string): type is ProductFieldType {
  return (PRODUCT_FIELD_TYPE_VALUES as readonly string[]).includes(type);
}

export function isEmbroideryPriceUnit(type: string): type is EmbroideryPriceUnit {
  return (EMBROIDERY_PRICE_UNIT_VALUES as readonly string[]).includes(type);
}
