/**
 * Per-collection data loaders + the data shapes they return.
 *
 * Loaders call the generated Tina client and pipe the result through
 * `requestWithMetadata()` so the editor overlay flows in when the page
 * renders inside the admin iframe and `tinaField()` has its metadata.
 *
 * Types below are pure derivations — no hand-written shapes. Each one is
 * either inferred from a loader's return type (`CmsConfig`/`CmsPage`/
 * `CmsBlog`) or `Extract`/index-accessed off those. The Tina collection
 * is the source of truth; regen with `tinacms dev` and everything
 * downstream updates.
 */
import { requestWithMetadata } from "@tinacms/astro/data";
import client from "../../tina/__generated__/client";
import {
  AssertTrue,
  type IfEquals,
  type RecursiveDiff,
  type RecursivelyNullableToUndefined,
  type RecursivelyRemoveKeys,
  type RecursivelyReplaceKeyType,
  type RecursivelyReplaceType,
  type RecursiveRequired,
} from "./typeUtils";
import type { InferEntrySchema } from "astro:content";
import type { ImageFunction } from "astro/content/config";
import type { z } from "astro/zod";
import type { GetImageResult } from "astro";
import { resolveImage } from "./assets";
import {
  canSupplyStringValue,
  isEmbroideryPriceUnit,
  isProductFieldType,
  type EmbroideryPriceUnit,
  type ProductFieldType,
} from "./productFieldTypes";
import type { LengthBasedPricingConfig } from "./types.svelte";

type Image = z.infer<ReturnType<ImageFunction>>;

type CmsOriginalMaterial = Awaited<
  ReturnType<typeof client.queries.product_materials>
>["data"]["product_materials"];
type CmsOriginalProduct = Awaited<ReturnType<typeof client.queries.product>>["data"]["product"];
type CmsOriginalDeliveryMethod = Awaited<
  ReturnType<typeof client.queries.delivery_methods>
>["data"]["delivery_methods"];

// #region DeliveryMethod

type CmsDeliveryMethod = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<CmsOriginalDeliveryMethod, `_${string}`>
>;
export interface CmsEnhancedDeliveryMethod extends Omit<CmsDeliveryMethod, "id"> {}

type AstroDeliveryMethod = InferEntrySchema<"deliveryMethod">;
AssertTrue<IfEquals<CmsEnhancedDeliveryMethod, AstroDeliveryMethod>>();

// #endregion

// #region Material

type CmsMaterialColor = NonNullable<NonNullable<CmsMaterial["colors"]>[number]>;
type CmsMaterial = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<CmsOriginalMaterial, `_${string}`>
>;

interface CmsEnhancedMaterialColor extends Omit<CmsMaterialColor, "image"> {
  image?: SlimImage | undefined | null;
}
interface CmsEnhancedMaterial extends Omit<CmsMaterial, "id" | "thumbnail" | "colors" | "content"> {
  thumbnail?: SlimImage | undefined | null;
  colors?: Array<CmsEnhancedMaterialColor> | undefined | null;
}

type AstroMaterial = RecursivelyReplaceType<InferEntrySchema<"material">, Image, SlimImage>;
type MaterialDiff = RecursiveDiff<CmsEnhancedMaterial, AstroMaterial>;
AssertTrue<IfEquals<MaterialDiff, never>>();

// #endregion
// #region Product
type CmsProduct = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<CmsOriginalProduct, `_${string}`>
>;

type CmsProductImage = NonNullable<NonNullable<CmsProduct["images"]>[number]>;
type CmsProductMaterials = NonNullable<CmsProduct["materials"]>;
type CmsProductMaterial = NonNullable<NonNullable<CmsProduct["materials"]>["materials"]>[number];
type CmsProductMaterialsBannedCombination = NonNullable<
  NonNullable<NonNullable<CmsProduct["materials"]>["banned_combinations"]>[number]
>;

interface CmsEnhancedProductImage extends Omit<CmsProductImage, "image"> {
  image?: SlimImage | undefined | null;
}

interface CmsEnhancedProductMaterial extends Omit<
  NonNullable<CmsProductMaterial>,
  "material_path"
> {
  material_path: CmsEnhancedMaterial;
}

interface CmsEnhancedProductMaterialsBannedCombination extends Omit<
  NonNullable<CmsProductMaterialsBannedCombination>,
  "materials"
> {
  materials?:
    | Array<{ material_path?: CmsEnhancedMaterial | undefined | null } | undefined | null>
    | undefined
    | null;
}

interface CmsEnhancedProductMaterials extends Omit<
  CmsProductMaterials,
  "materials" | "banned_combinations"
> {
  materials?: Array<CmsEnhancedProductMaterial | undefined | null> | undefined | null;
  banned_combinations?:
    Array<CmsEnhancedProductMaterialsBannedCombination | undefined | null> | undefined | null;
}

type CmsFlatField = NonNullable<NonNullable<CmsProduct["fields"]>[number]>;
/**
 * `fields` share one shape with a `type` discriminant drawn from the central
 * PRODUCT_FIELD_TYPES list; the runtime `Field` type turns it into a per-type
 * discriminated union (see docs/embroidery-field-plan.md).
 */
type CmsField = {
  [K in keyof CmsFlatField]: K extends "type" ? ProductFieldType : CmsFlatField[K];
} & {
  price_unit?: EmbroideryPriceUnit | undefined | null;
};

export interface CmsEnhancedProduct extends Omit<
  CmsProduct,
  | "id"
  | "date"
  | "thumbnail"
  | "content"
  | "discount_valid_until"
  | "images"
  | "materials"
  | "fields"
  | "icon"
  | "priced_by_length"
> {
  thumbnail?: SlimImage | undefined | null;
  discount_valid_until?: Date | undefined | null;
  icon?: SlimImage | undefined | null;
  date?: Date | undefined | null;
  images?: Array<CmsEnhancedProductImage | undefined | null> | undefined | null;
  materials?: CmsEnhancedProductMaterials | undefined | null;
  fields?: Array<CmsField | undefined | null> | undefined | null;
  length_based_pricing?: LengthBasedPricingConfig | undefined | null;
}

type AstroProduct = RecursivelyReplaceKeyType<
  RecursivelyReplaceType<InferEntrySchema<"product">, Image, SlimImage>,
  "material_path",
  CmsEnhancedMaterial
>;
type ProductDiff = RecursiveDiff<CmsEnhancedProduct, AstroProduct>;
AssertTrue<IfEquals<ProductDiff, never>>();

// #endregion

// #region Config

type CmsConfig = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<
    Awaited<ReturnType<typeof client.queries.config>>["data"]["config"],
    `_${string}`
  >
>;

export interface CmsEnhancedConfig extends Omit<CmsConfig, "logo" | "footerLogo" | "id"> {
  logo?: GetImageResult | undefined | null;
  footerLogo?: GetImageResult | undefined | null;
}

type AstroConfig = RecursivelyReplaceType<InferEntrySchema<"config">, Image, GetImageResult>;
type ConfigDiff = RecursiveDiff<CmsEnhancedConfig, AstroConfig>;
AssertTrue<IfEquals<ConfigDiff, never>>();

// #endregion

// #region Embroidery

type CmsEmbroidery = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<
    Awaited<ReturnType<typeof client.queries.embroidery>>["data"]["embroidery"],
    `_${string}`
  >
>;
type CmsEmbroideryColor = NonNullable<NonNullable<CmsEmbroidery["colors"]>[number]>;

export interface CmsEnhancedEmbroideryColor extends Omit<CmsEmbroideryColor, "image"> {
  image?: SlimImage | undefined | null;
}
interface CmsEnhancedEmbroidery extends Omit<CmsEmbroidery, "id" | "colors"> {
  colors?: Array<CmsEnhancedEmbroideryColor> | undefined | null;
}

type AstroEmbroidery = RecursivelyReplaceType<InferEntrySchema<"embroidery">, Image, SlimImage>;
type EmbroideryDiff = RecursiveDiff<CmsEnhancedEmbroidery, AstroEmbroidery>;
AssertTrue<IfEquals<EmbroideryDiff, never>>();

// #endregion

/**
 * Flatten a Tina `*Connection` query result into a plain array of nodes,
 * dropping the nullable `edges` / `edge` / `node` wrappers Tina emits.
 */
function nodesFrom<TNode>(
  connection: { edges?: ({ node?: TNode | null } | null)[] | null } | null | undefined
): TNode[] {
  return connection?.edges?.flatMap((edge) => (edge?.node ? [edge.node] : [])) ?? [];
}

/**
 * Run a resolvable image reference through Astro's build-time image pipeline
 * (`getImage`) and return the optimized `src`.
 *
 * Plain `<img>` tags and client islands can't use `<Image>` / `getImage` at
 * runtime, so images that reach them (order-island color swatches, the
 * header/footer logos that are also serialized alongside the config) would
 * otherwise ship as the full-resolution original. `getImage` IS available here
 * — this module runs at build time inside the Astro server graph — so we
 * pre-optimize and hand the consumer a ready `src`. Falls back to the original
 * path when it can't resolve to a local asset (e.g. SVGs the pipeline passes
 * through, or unknown references).
 */
async function optimizeImage(path: string, width: number): Promise<GetImageResult | undefined> {
  const optimized = await resolveImage({ src: path, width });
  if (!optimized) {
    return undefined;
  }

  return {
    ...optimized,
    rawOptions: {
      ...optimized.rawOptions,
      src:
        typeof optimized.rawOptions.src === "string"
          ? optimized.rawOptions.src
          : { ...optimized.rawOptions.src },
    },
    options: {
      ...optimized.options,
      src:
        typeof optimized.options.src === "string"
          ? optimized.options.src
          : { ...optimized.options.src },
    },
  };
}

/**
 * The subset of a `GetImageResult` the order island actually renders: its plain
 * `<img>` reads only `src`, the `srcset` string, and the spread `attributes`.
 * Serializing the full result (its `options` / `rawOptions` and every
 * `srcSet.values` transform) into the island props ballooned the contact page
 * to ~6 MB — those images repeat across every product — so island-bound images
 * keep just these fields (~75% smaller each).
 */
export interface SlimImage {
  src: string;
  srcSet: { attribute: GetImageResult["srcSet"]["attribute"] };
  attributes: GetImageResult["attributes"];
}

/**
 * Like {@link optimizeImage} but returns only the {@link SlimImage} fields the
 * order island renders. Use for every image serialized into island props;
 * reserve {@link optimizeImage} for images handed back to Astro's `<Image>`
 * (the header/footer logos), which needs the full result to re-optimize.
 */
async function optimizeIslandImage(path: string, width: number): Promise<SlimImage | undefined> {
  const optimized = await resolveImage({ src: path, width });
  if (!optimized) {
    return undefined;
  }

  return {
    src: optimized.src,
    srcSet: { attribute: optimized.srcSet.attribute },
    attributes: optimized.attributes,
  };
}

// Render widths (2x for retina) for images consumed outside `<Image>`.
const SWATCH_WIDTH = 200; // ~24px swatch (`size-6`) in the order island
const LOGO_WIDTH = 400; // ~100–200px header logo
const FOOTER_LOGO_WIDTH = 510; // ~255px footer logo

export const getConfig = async (): Promise<
  RecursiveRequired<CmsEnhancedConfig, GetImageResult>
> => {
  const result = await requestWithMetadata(client.queries.config({ relativePath: "config.json" }));
  const { logo, footerLogo } = result.data.config;

  return {
    logo: logo ? await optimizeImage(logo, LOGO_WIDTH) : undefined,
    footerLogo: footerLogo ? await optimizeImage(footerLogo, FOOTER_LOGO_WIDTH) : undefined,
    blogPageURL: result.data.config.blogPageURL ?? undefined,
    contactLink: result.data.config.contactLink ?? undefined,
    copyright: result.data.config.copyright ?? undefined,
    description: result.data.config.description ?? undefined,
    ogLocale: result.data.config.ogLocale ?? undefined,
    pagination: {
      pagerSize: result.data.config.pagination?.pagerSize ?? undefined,
    },
    fabformURL: result.data.config.fabformURL ?? undefined,
    title: result.data.config.title,
    titleAddition: result.data.config.titleAddition ?? undefined,
    titleSeparator: result.data.config.titleSeparator ?? undefined,
    themeColor: result.data.config.themeColor ?? undefined,
    social: (result.data.config.social ?? []).map((social) => ({
      icon: social?.icon ?? undefined,
      url: social?.url ?? undefined,
      weight: social?.weight ?? undefined,
    })),
    mainMenu: (result.data.config.mainMenu ?? []).map((menu) => ({
      name: menu?.name ?? undefined,
      url: menu?.url ?? undefined,
      weight: menu?.weight ?? undefined,
    })),
    sitemapMenu: (result.data.config.sitemapMenu ?? []).map((menu) => ({
      name: menu?.name ?? undefined,
      url: menu?.url ?? undefined,
      weight: menu?.weight ?? undefined,
    })),
    address: {
      phone: result.data.config.address?.phone ?? undefined,
      email: result.data.config.address?.email ?? undefined,
      address: result.data.config.address?.address ?? undefined,
      openingHours: result.data.config.address?.openingHours ?? undefined,
    },
    footerContact: {
      title: result.data.config.footerContact?.title ?? undefined,
      button: result.data.config.footerContact?.button ?? undefined,
      topTitle: result.data.config.footerContact?.topTitle ?? undefined,
    },
  };
};

/**
 * The shared embroidery thread-colour palette (global config), with images run
 * through the build-time pipeline like material colours. Consumed by the order
 * island's `embroidery` field type.
 */
export const getThreadColors = async (): Promise<CmsEnhancedEmbroideryColor[]> => {
  const result = await requestWithMetadata(
    client.queries.embroidery({ relativePath: "embroidery.json" })
  );

  return Promise.all(
    (result.data.embroidery.colors ?? [])
      .filter((color) => color != null)
      .map(async (color) => ({
        color_id: color.color_id,
        label: color.label,
        hex: color.hex ?? undefined,
        image: color.image ? await optimizeIslandImage(color.image, SWATCH_WIDTH) : undefined,
      }))
  );
};

/** Narrow Tina's loose `type: string` to the product-field discriminant. */
function toProductFieldType(type: string): ProductFieldType {
  if (isProductFieldType(type)) {
    return type;
  }
  throw new Error(`Ismeretlen termék mező típus: ${type}`);
}

/**
 * Fail the build when a product's cross-field references point at a missing (or
 * unusable) field. These references are plain strings in the CMS, so without
 * this a typo or a renamed field silently degrades to `undefined` at runtime
 * (see the `FRAGILE` markers in priceUtils/materialUtils/fieldVisibility).
 */
function assertValidProductReferences(
  product: RecursiveRequired<CmsEnhancedProduct, SlimImage | Date>
): void {
  const fields = (product.fields ?? []).filter((f) => f != null);
  const fieldByName = new Map(fields.map((f) => [f.name, f]));
  const where = `Termék "${product.product_id}"`;

  const source = product.length_based_pricing?.sourceField;
  if (source) {
    const target = fieldByName.get(source);
    if (!target) {
      throw new Error(
        `${where}: a méteráru "sourceField" nem létező mezőre hivatkozik: "${source}".`
      );
    }
    if (!canSupplyStringValue(target.type)) {
      throw new Error(
        `${where}: a méteráru forrásmező ("${source}") típusa "${target.type}", ami nem adhat hossz értéket.`
      );
    }
  }

  for (const field of fields) {
    const dep = field.depends_on?.field;
    if (!dep) {
      continue;
    }
    if (dep === field.name) {
      throw new Error(`${where}: a "${field.name}" mező önmagára hivatkozik a "depends_on"-ban.`);
    }
    if (!fieldByName.has(dep)) {
      throw new Error(
        `${where}: a "${field.name}" mező "depends_on" hivatkozása nem létező mezőre mutat: "${dep}".`
      );
    }
  }

  for (const material of product.materials?.materials ?? []) {
    const colorCount = material?.color_count;
    // A numeric literal is a plain count; anything else is a field reference.
    if (!material || !colorCount || !Number.isNaN(Number.parseFloat(colorCount))) {
      continue;
    }
    const target = fieldByName.get(colorCount);
    if (!target) {
      throw new Error(
        `${where}: a "${material.material_path.material_id}" anyag "color_count" hivatkozása nem létező mezőre mutat: "${colorCount}".`
      );
    }
    if (!canSupplyStringValue(target.type)) {
      throw new Error(
        `${where}: a "${material.material_path.material_id}" anyag "color_count" forrásmezője ("${colorCount}") típusa "${target.type}", ami nem adhat számértéket.`
      );
    }
  }
}

export const getProducts = async (): Promise<CmsEnhancedProduct[]> => {
  const response = await client.queries.productConnection();

  const products = nodesFrom(response.data.productConnection).toSorted((a, b) =>
    a.title.localeCompare(b.title)
  );

  const result: RecursiveRequired<CmsEnhancedProduct, SlimImage | Date>[] = [];

  for (const product of products) {
    const enhanced: RecursiveRequired<CmsEnhancedProduct, SlimImage | Date> = {
      product_id: product.product_id,
      title: product.title,
      hidden_in_product_list: product.hidden_in_product_list ?? undefined,
      can_be_ordered: product.can_be_ordered ?? undefined,
      categories: product.categories ?? undefined,
      date: product.date ? new Date(product.date) : undefined,
      thumbnail: product.thumbnail
        ? await optimizeIslandImage(product.thumbnail, LOGO_WIDTH)
        : undefined,
      shortDescription: product.shortDescription ?? undefined,
      icon: product.icon ? await optimizeIslandImage(product.icon, LOGO_WIDTH) : undefined,
      // An empty `sourceField` (the "— Nem méteráru —" select option) means off.
      length_based_pricing: product.length_based_pricing?.sourceField
        ? { sourceField: product.length_based_pricing.sourceField }
        : undefined,
      price: product.price,
      discount: product.discount ?? undefined,
      discount_valid_until: product.discount_valid_until
        ? new Date(product.discount_valid_until)
        : undefined,
      images: await Promise.all(
        (product.images ?? [])
          .filter((image) => image != null)
          .map(async (image) => ({
            image: image.image ? await optimizeIslandImage(image.image, LOGO_WIDTH) : undefined,
            description: image.description ?? undefined,
          }))
      ),
      materials: {
        materials: await Promise.all(
          (product.materials?.materials ?? [])
            .filter((material) => material != null)
            .map(async (material) => {
              const material_path = material.material_path;
              return {
                price: material.price,
                color_count: material.color_count,
                material_path: await transformMaterial(material_path),
              };
            })
        ),
        banned_combinations: await Promise.all(
          (product.materials?.banned_combinations ?? [])
            .filter((combination) => combination != null)
            .map(async (combination) => ({
              materials: await Promise.all(
                (combination.materials ?? [])
                  .filter((material) => material != null)
                  .map(async (material) => ({
                    material_path: await transformMaterial(material.material_path),
                  }))
              ),
            }))
        ),
        material_required_count: product.materials?.material_required_count ?? 0,
      },
      table:
        product.table
          ?.filter((row) => row != null)
          .map((row) => ({
            description: row.description ?? undefined,
            title: row.title ?? undefined,
          })) ?? undefined,
      fields:
        product.fields
          ?.filter((field) => field != null)
          .map((field): RecursiveRequired<CmsField, GetImageResult | Date> => {
            const base = {
              allow_custom_value: field.allow_custom_value ?? undefined,
              label: field.label,
              name: field.name,
              optional: field.optional ?? undefined,
              placeholder: field.placeholder ?? undefined,
              price: field.price ?? undefined,
              price_unit:
                "price_unit" in field && field.price_unit && isEmbroideryPriceUnit(field.price_unit)
                  ? field.price_unit
                  : undefined,
              regex: field.regex ?? undefined,
              tooltip: field.tooltip ?? undefined,
              depends_on: field.depends_on
                ? {
                    field: field.depends_on.field ?? undefined,
                    value: field.depends_on.value ?? undefined,
                  }
                : undefined,
              items:
                field.items
                  ?.filter((item) => item != null)
                  .map((item) => ({
                    label: item.label,
                    value: item.value,
                    price: item.price ?? undefined,
                    tooltip: item.tooltip ?? undefined,
                  })) ?? undefined,
            };

            // Re-tag the shared shape with a literal `type` — the single point
            // where Tina's loose `type: string` becomes our discriminated union.
            return { ...base, type: toProductFieldType(field.type) };
          }) ?? undefined,
    };

    assertValidProductReferences(enhanced);
    result.push(enhanced);
  }

  return result;
};

const transformMaterial = async (
  material: CmsOriginalMaterial
): Promise<RecursiveRequired<CmsEnhancedMaterial, SlimImage>> => {
  return {
    material_id: material.material_id,
    label: material.label,
    categories: material.categories ?? undefined,
    shortDescription: material.shortDescription ?? undefined,
    thumbnail: material.thumbnail
      ? await optimizeIslandImage(material.thumbnail, LOGO_WIDTH)
      : undefined,
    colors: material.colors
      ? await Promise.all(
          material.colors
            .filter((color) => color != null)
            .map(async (color) => ({
              color_id: color.color_id.trim(),
              label: color.label,
              hex: color.hex ?? undefined,
              image: color.image ? await optimizeIslandImage(color.image, SWATCH_WIDTH) : undefined,
            }))
        )
      : undefined,
  };
};

export const getMaterials = async (): Promise<CmsEnhancedMaterial[]> => {
  const response = await client.queries.product_materialsConnection();

  const materials = nodesFrom(response.data.product_materialsConnection).toSorted((a, b) =>
    a.label.localeCompare(b.label)
  );

  const result: RecursiveRequired<CmsEnhancedMaterial, SlimImage>[] = [];

  for (const material of materials) {
    result.push(await transformMaterial(material));
  }

  return result;
};

export const getDeliveryMethods = async (): Promise<CmsEnhancedDeliveryMethod[]> => {
  const result = await client.queries.delivery_methodsConnection();

  const nodes = nodesFrom(result.data.delivery_methodsConnection);
  return nodes;
};

/** A single member of a product group ("set"). */
export interface CmsProductGroupMember {
  product_id: string;
}

export interface CmsProductGroup {
  title: string;
  /**
   * The percent discount (0–100) every member of the set earns when it is
   * ordered in this set. Optional: a set with no value earns no discount.
   * See docs/set-pricing-model.md.
   */
  discount_percent?: number | undefined;
  products: CmsProductGroupMember[];
}

export const getProductGroups = async (): Promise<CmsProductGroup[]> => {
  const result = await client.queries.product_groupsConnection();

  const nodes = nodesFrom(result.data.product_groupsConnection);
  return nodes.map((group) => {
    const products: RecursiveRequired<CmsProductGroupMember>[] = [];
    for (const x of group.products ?? []) {
      if (x?.product) {
        products.push({ product_id: x.product.product_id });
      }
    }
    return {
      title: group.title,
      discount_percent: group.discount_percent ?? undefined,
      products,
    };
  });
};
