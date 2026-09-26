/**
 * Single source of truth for product field `type` values.
 *
 * Consumed by the Tina product collection (the `type` select options), the
 * Astro content schema (`z.enum`) and `data.ts` (runtime narrowing + the
 * `CmsField` discriminant). Add a new field type here once and every consumer
 * picks it up; the derived `ProductFieldType` keeps exhaustiveness honest.
 */
export const PRODUCT_FIELD_TYPES = [
  { value: "input", label: "Szöveg", valueKind: "string" },
  { value: "select", label: "Legördülő", valueKind: "string" },
  { value: "radio", label: "Gombos - egyválasztós", valueKind: "string" },
  { value: "color", label: "Szín", valueKind: "string" },
  { value: "toggle", label: "Igen/Nem", valueKind: "boolean" },
  { value: "embroidery", label: "Hímzés", valueKind: "none" },
] as const;

export const EMBROIDERY_PRICE_UNITS = [
  { value: "flat", label: "Fix ár" },
  { value: "word", label: "Szavanként" },
] as const;

export type ProductFieldType = (typeof PRODUCT_FIELD_TYPES)[number]["value"];
export type EmbroideryPriceUnit = (typeof EMBROIDERY_PRICE_UNITS)[number]["value"];

/**
 * The kind of scalar a field `type` can ever yield, independent of the user's
 * current input. Declared once per entry in {@link PRODUCT_FIELD_TYPES} above,
 * so a new field type is a compile error until it is classified — the single
 * source of truth for every "toggle/embroidery can't supply a value" check
 * (build-time reference validation, Tina reference pickers, `StringValueField`).
 */
export type FieldValueKind = (typeof PRODUCT_FIELD_TYPES)[number]["valueKind"];

/** The field types whose stored value is a plain string (issue #15). */
export type StringValuedFieldType = {
  [T in ProductFieldType]: ValueKindOf<T> extends "string" ? T : never;
}[ProductFieldType];

type ValueKindOf<T extends ProductFieldType> = Extract<
  (typeof PRODUCT_FIELD_TYPES)[number],
  { value: T }
>["valueKind"];

const VALUE_KIND_BY_TYPE = Object.fromEntries(
  PRODUCT_FIELD_TYPES.map((t) => [t.value, t.valueKind])
) as Record<ProductFieldType, FieldValueKind>;

/** The scalar kind {@link ProductFieldType} yields (`string` | `boolean` | `none`). */
export function fieldValueKind(type: ProductFieldType): FieldValueKind {
  return VALUE_KIND_BY_TYPE[type];
}

/** Whether the type can supply a string value usable as a numeric source. */
export function canSupplyStringValue(type: ProductFieldType): boolean {
  return fieldValueKind(type) === "string";
}

/** Whether the type yields any value another field can reference (not embroidery). */
export function hasResolvableValue(type: ProductFieldType): boolean {
  return fieldValueKind(type) !== "none";
}

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
