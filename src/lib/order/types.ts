/**
 * The order island's data shapes, produced by the Vendure catalog mappers
 * (`src/lib/catalog/orderProduct.ts`) and consumed by the order form
 * (`src/lib/types.svelte.ts` derives the runtime field-value union from
 * `OrderProduct`). These are hand-written: the mappers' assignments and the
 * island components keep them honest in both directions. Keys are required
 * with `undefined | null` values — the shape the form's defensive reads were
 * written against — and the mappers normalize away the nulls.
 */
import type { GetImageResult } from "astro";
import type { EmbroideryPriceUnit, ProductFieldType } from "../product/fieldTypes";
import type { ProductType } from "../product/productTypes";

/**
 * The subset of a `GetImageResult` an island actually renders: its plain
 * `<img>` reads only `src`, the `srcset` string, and the spread `attributes`.
 * Serializing the full result ballooned pages (images repeat across every
 * product), so island-bound images keep just these fields.
 */
export interface SlimImage {
  src: string;
  srcSet: { attribute: GetImageResult["srcSet"]["attribute"] };
  attributes: GetImageResult["attributes"];
}

/** Structured configuration for length-based pricing. */
export interface LengthBasedPricingConfig {
  sourceField: string;
}

export interface OrderMaterialColor {
  color_id: string;
  label: string;
  hex: string | undefined | null;
  image: SlimImage | undefined | null;
}

export interface OrderMaterial {
  material_id: string;
  label: string;
  categories: string | undefined | null;
  shortDescription: string | undefined | null;
  thumbnail: SlimImage | undefined | null;
  colors: Array<OrderMaterialColor> | undefined | null;
}

export interface OrderFieldItem {
  value: string;
  label: string | undefined | null;
  price: number | undefined | null;
  tooltip: string | undefined | null;
}

export interface OrderFieldDependency {
  field: string;
  value: string | undefined | null;
}

export interface OrderFieldMaterial {
  price: number;
  material_path: OrderMaterial;
}

/**
 * A configured field as the island receives it: one flat shape with a `type`
 * discriminant drawn from the central PRODUCT_FIELD_TYPES list. The runtime
 * `Field` union (types.svelte.ts) tags each kind with its own value shape.
 */
export interface OrderField {
  type: ProductFieldType;
  name: string;
  label: string;
  optional: boolean | undefined | null;
  price: number | undefined | null;
  price_unit: EmbroideryPriceUnit | undefined | null;
  allow_custom_value: boolean | undefined | null;
  regex: string | undefined | null;
  placeholder: string | undefined | null;
  tooltip: string | undefined | null;
  depends_on: OrderFieldDependency | undefined | null;
  color_count: string | undefined | null;
  materials: Array<OrderFieldMaterial | undefined | null> | undefined | null;
  items: Array<OrderFieldItem | undefined | null> | undefined | null;
}

export interface OrderProductImage {
  image: SlimImage | undefined | null;
  description: string | undefined | null;
}

export interface OrderProductBannedCombination {
  materials:
    | Array<{ material_path: OrderMaterial | undefined | null } | undefined | null>
    | undefined
    | null;
}

export interface OrderProductMaterials {
  banned_combinations: Array<OrderProductBannedCombination | undefined | null> | undefined | null;
}

export interface OrderProduct {
  product_id: string;
  title: string;
  hidden_in_product_list: boolean | undefined | null;
  can_be_ordered: boolean | undefined | null;
  categories: string | undefined | null;
  shortDescription: string | undefined | null;
  type: ProductType;
  date: Date | undefined | null;
  thumbnail: SlimImage | undefined | null;
  icon: SlimImage | undefined | null;
  images: Array<OrderProductImage | undefined | null> | undefined | null;
  price: number;
  length_based_pricing: LengthBasedPricingConfig | undefined | null;
  materials: OrderProductMaterials | undefined | null;
  fields: Array<OrderField | undefined | null> | undefined | null;
}

/** A single member of a product group ("set"). */
export interface OrderProductGroupMember {
  product_id: string;
}

export interface OrderProductGroup {
  title: string;
  /**
   * The flat forint discount every formed instance of the set earns when its
   * members are ordered together. Optional: a group with a zero or absent
   * value grants no discount and is shown as related items instead.
   * See the `product-sets` spec in `docs/specs/product-sets.md`.
   */
  discount_amount?: number | undefined;
  products: OrderProductGroupMember[];
}

/** The shared embroidery thread-colour palette, as the embroidery field renders it. */
export interface OrderThreadColor {
  color_id: string;
  label: string;
  hex: string | undefined | null;
  image: SlimImage | undefined | null;
}
