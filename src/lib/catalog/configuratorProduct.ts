import {
  resolveText,
  type FieldVisibility,
  type ProductField,
} from "@babasarok/product-definition";
import type {
  ConfiguratorField,
  ConfiguratorThreadColor,
  ConfiguratorProduct,
  ConfiguratorProductGroup,
} from "@/lib/configurator/types";
import { isProductType } from "@/lib/product/productTypes";
import type { ProductDefinition } from "@babasarok/product-definition";
import { imageUrl, type SlimImage, type VendureAsset } from "@/lib/vendure/imageUrl";
import { cardImage } from "./listItems";
import type {
  CatalogMaterial,
  CatalogProduct,
  CatalogProductGroup,
  CatalogThreadColor,
} from "./mappers";

const FALLBACK_TYPE = "kiegeszito";
type ConfiguratorMaterial = NonNullable<
  NonNullable<ConfiguratorField["materials"]>[number]
>["material_path"];

function swatchImage(asset: VendureAsset, assetBase: string): SlimImage {
  return {
    src: imageUrl(asset.source, "card-sm", assetBase, asset.focalPoint),
    srcSet: { attribute: "" },
    attributes: {},
  };
}

function toOrderMaterial(material: CatalogMaterial, assetBase: string): ConfiguratorMaterial {
  return {
    material_id: material.slug,
    label: material.label,
    categories: material.subtitle,
    shortDescription: material.description,
    thumbnail: material.thumbnail ? swatchImage(material.thumbnail, assetBase) : undefined,
    colors: material.colors.map((color) => ({
      color_id: color.id,
      label: color.label,
      hex: color.hex ?? undefined,
      image: color.image ? swatchImage(color.image, assetBase) : undefined,
    })),
  };
}

function dependsOn(visibility: FieldVisibility): ConfiguratorField["depends_on"] {
  if (visibility.kind === "always") {
    return undefined;
  }

  if (visibility.kind === "when-present") {
    return { field: visibility.fieldId, value: undefined };
  }

  return { field: visibility.fieldId, value: String(visibility.value) };
}

function toOrderField(
  field: ProductField,
  materials: ReadonlyMap<string, ConfiguratorMaterial>,
  languageCode: string
): ConfiguratorField {
  const base = {
    optional: undefined,
    price: undefined,
    price_unit: undefined,
    allow_custom_value: undefined,
    regex: undefined,
    placeholder: undefined,
    color_count: undefined,
    items: undefined,
    materials: undefined,
    depends_on: undefined,
    name: field.id,
    label: resolveText(field.label, languageCode),
    tooltip: field.tooltip === undefined ? undefined : resolveText(field.tooltip, languageCode),
  };

  if (field.kind === "input") {
    return {
      ...base,
      type: "input",
      price: field.price,
      optional: !field.required,
      placeholder:
        field.placeholder === undefined ? undefined : resolveText(field.placeholder, languageCode),
      regex: field.pattern,
      depends_on: dependsOn(field.visibility),
      items: field.suggestions?.map((suggestion) => ({
        value: suggestion.value,
        label: resolveText(suggestion.label, languageCode),
        price: undefined,
        tooltip: undefined,
      })),
    };
  }

  if (field.kind === "choice") {
    const placeholder = field.customValue?.placeholder;

    return {
      ...base,
      type: field.presentation,
      depends_on: dependsOn(field.visibility),
      allow_custom_value: field.customValue !== undefined,
      regex: field.customValue?.pattern,
      placeholder: placeholder === undefined ? undefined : resolveText(placeholder, languageCode),
      items: field.options.map((option) => ({
        value: option.id,
        label: resolveText(option.label, languageCode),
        price: option.price,
        tooltip:
          option.tooltip === undefined ? undefined : resolveText(option.tooltip, languageCode),
      })),
    };
  }

  if (field.kind === "toggle") {
    return {
      ...base,
      type: "toggle",
      price: field.price,
      depends_on: dependsOn(field.visibility),
    };
  }

  if (field.kind === "embroidery") {
    return {
      ...base,
      type: "embroidery",
      depends_on: dependsOn(field.visibility),
      price_unit: field.pricing.kind === "flat" ? "flat" : "word",
      price: field.pricing.kind === "flat" ? field.pricing.price : field.pricing.pricePerWord,
      regex: field.pattern,
      placeholder:
        field.placeholder === undefined ? undefined : resolveText(field.placeholder, languageCode),
    };
  }

  return {
    ...base,
    type: "material",
    color_count:
      field.colorCount.kind === "fixed" ? String(field.colorCount.count) : field.colorCount.fieldId,
    materials: field.options.flatMap((option) => {
      const material = materials.get(option.materialId);

      return material === undefined ? [] : [{ price: option.price, material_path: material }];
    }),
  };
}

export function toConfiguratorProduct(
  product: CatalogProduct,
  definition: ProductDefinition,
  materials: readonly CatalogMaterial[],
  assetBase: string,
  languageCode: string
): ConfiguratorProduct {
  const orderMaterials = new Map(
    materials.map((material) => [material.slug, toOrderMaterial(material, assetBase)])
  );
  const typeCode = product.type?.code;

  return {
    product_id: definition.id,
    title: product.name,
    // The definition carries no hidden flag any more (hiding is the native
    // product's "enabled" switch); the key stays in the Cms shape until the
    // Tina product backend is removed.
    hidden_in_product_list: undefined,
    // Orderability is the same switch; every definition-backed product the
    // site can reach is orderable.
    can_be_ordered: true,
    categories: product.tagline ?? undefined,
    shortDescription: product.shortDescription ?? undefined,
    type: typeCode !== undefined && isProductType(typeCode) ? typeCode : FALLBACK_TYPE,
    date: product.date ? new Date(product.date) : undefined,
    thumbnail: product.thumbnail ? cardImage(product.thumbnail, assetBase) : undefined,
    icon: undefined,
    images: [],
    price: definition.basePrice,
    length_based_pricing:
      definition.pricing.kind === "length"
        ? { sourceField: definition.pricing.sourceFieldId }
        : undefined,
    materials: {
      banned_combinations: definition.forbiddenMaterialCombinations.map((combination) => ({
        materials: combination.flatMap((id) => {
          const material = orderMaterials.get(id);

          return material === undefined ? [] : [{ material_path: material }];
        }),
      })),
    },
    fields: definition.fields.map((field) => toOrderField(field, orderMaterials, languageCode)),
  };
}

export function toConfiguratorGroups(
  groups: readonly CatalogProductGroup[]
): ConfiguratorProductGroup[] {
  return groups.map((group) => ({
    title: group.label,
    discount_amount: group.kind === "set" ? (group.discount ?? undefined) : undefined,
    products: group.productIds.map((product_id) => ({ product_id })),
  }));
}

export function toConfiguratorThreadColors(
  colors: readonly CatalogThreadColor[],
  assetBase: string
): ConfiguratorThreadColor[] {
  return colors.map((color) => ({
    color_id: color.id,
    label: color.label,
    hex: color.hex ?? undefined,
    image: color.swatch ? swatchImage(color.swatch, assetBase) : undefined,
  }));
}
