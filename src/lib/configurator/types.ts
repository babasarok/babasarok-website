/**
 * The configurator's data shapes, produced by the Vendure catalog mappers
 * (`src/lib/catalog/configuratorProduct.ts`) and consumed by the configurator
 * island (`src/lib/configurator/item.svelte.ts` derives the runtime
 * field-value union from `ConfiguratorProduct`). These are hand-written: the
 * mappers' assignments and the island components keep them honest in both
 * directions. Keys are required with `undefined | null` values — the shape
 * the form's defensive reads were written against — and the mappers
 * normalize away the nulls.
 */
import type { SlimImage } from "@/lib/vendure/imageUrl";
import type { EmbroideryPriceUnit, ProductFieldType } from "@/lib/configurator/fieldTypes";
import type { ProductType } from "@/lib/product/productTypes";

/** Structured configuration for length-based pricing. */
export interface LengthBasedPricingConfig {
  sourceField: string;
}

export interface ConfiguratorMaterialColor {
  color_id: string;
  label: string;
  hex: string | undefined | null;
  image: SlimImage | undefined | null;
}

export interface ConfiguratorMaterial {
  material_id: string;
  label: string;
  categories: string | undefined | null;
  shortDescription: string | undefined | null;
  thumbnail: SlimImage | undefined | null;
  colors: Array<ConfiguratorMaterialColor> | undefined | null;
}

export interface ConfiguratorFieldItem {
  value: string;
  label: string | undefined | null;
  price: number | undefined | null;
  tooltip: string | undefined | null;
}

export interface ConfiguratorFieldDependency {
  field: string;
  value: string | undefined | null;
}

export interface ConfiguratorFieldMaterial {
  price: number;
  material_path: ConfiguratorMaterial;
}

/**
 * A configured field as the island receives it: one flat shape with a `type`
 * discriminant drawn from the central PRODUCT_FIELD_TYPES list. The runtime
 * `Field` union (item.svelte.ts) tags each kind with its own value shape.
 */
export interface ConfiguratorField {
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
  depends_on: ConfiguratorFieldDependency | undefined | null;
  color_count: string | undefined | null;
  materials: Array<ConfiguratorFieldMaterial | undefined | null> | undefined | null;
  items: Array<ConfiguratorFieldItem | undefined | null> | undefined | null;
}

export interface ConfiguratorProductImage {
  image: SlimImage | undefined | null;
  description: string | undefined | null;
}

export interface ConfiguratorProductBannedCombination {
  materials:
    | Array<{ material_path: ConfiguratorMaterial | undefined | null } | undefined | null>
    | undefined
    | null;
}

export interface ConfiguratorProductMaterials {
  banned_combinations:
    Array<ConfiguratorProductBannedCombination | undefined | null> | undefined | null;
}

export interface ConfiguratorProduct {
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
  images: Array<ConfiguratorProductImage | undefined | null> | undefined | null;
  price: number;
  length_based_pricing: LengthBasedPricingConfig | undefined | null;
  materials: ConfiguratorProductMaterials | undefined | null;
  fields: Array<ConfiguratorField | undefined | null> | undefined | null;
}

/** A single member of a product group ("set"). */
export interface ConfiguratorProductGroupMember {
  product_id: string;
}

export interface ConfiguratorProductGroup {
  title: string;
  /**
   * The flat forint discount every formed instance of the set earns when its
   * members are ordered together. Optional: a group with a zero or absent
   * value grants no discount and is shown as related items instead.
   * See the `product-sets` spec in `docs/specs/product-sets.md`.
   */
  discount_amount?: number | undefined;
  products: ConfiguratorProductGroupMember[];
}

/** The shared embroidery thread-colour palette, as the embroidery field renders it. */
export interface ConfiguratorThreadColor {
  color_id: string;
  label: string;
  hex: string | undefined | null;
  image: SlimImage | undefined | null;
}
