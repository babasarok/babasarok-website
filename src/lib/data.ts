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
import { getImage } from "astro:assets";
import { requestWithMetadata } from "@tinacms/astro/data";
import client from "../../tina/__generated__/client";
import { resolveImage } from "./assets";
import {
  AssertTrue,
  type IfEquals,
  type RecursiveDiff,
  type RecursivelyNullableToUndefined,
  type RecursivelyRemoveKeys,
  type RecursivelyReplaceType,
  type RecursiveRequired,
} from "./typeUtils";
import type { InferEntrySchema } from "astro:content";
import type { ImageFunction } from "astro/content/config";
import type { z } from "astro/zod";
import type { GetImageResult } from "astro";

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
interface CmsEnhancedDeliveryMethod extends Omit<CmsDeliveryMethod, "id"> {}

type AstroDeliveryMethod = InferEntrySchema<"deliveryMethod">;
AssertTrue<IfEquals<CmsEnhancedDeliveryMethod, AstroDeliveryMethod>>();

// #endregion

// #region Material

type CmsMaterialColor = NonNullable<NonNullable<CmsMaterial["colors"]>[number]>;
type CmsMaterial = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<CmsOriginalMaterial, `_${string}`>
>;

interface CmsEnhancedMaterialColor extends Omit<CmsMaterialColor, "image"> {
  image?: GetImageResult | undefined | null;
}
interface CmsEnhancedMaterial extends Omit<CmsMaterial, "id" | "thumbnail" | "colors" | "content"> {
  thumbnail?: GetImageResult | undefined | null;
  colors?: Array<CmsEnhancedMaterialColor> | undefined | null;
}

type AstroMaterial = RecursivelyReplaceType<InferEntrySchema<"material">, Image, GetImageResult>;
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
  image?: GetImageResult | undefined | null;
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
interface CmsEnhancedProduct extends Omit<
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
> {
  thumbnail?: GetImageResult | undefined | null;
  discount_valid_until?: Date | undefined | null;
  icon?: GetImageResult | undefined | null;
  date?: Date | undefined | null;
  images?: Array<CmsEnhancedProductImage | undefined | null> | undefined | null;
  materials?: CmsEnhancedProductMaterials | undefined | null;
}

type AstroProduct = RecursivelyReplaceType<InferEntrySchema<"product">, Image, GetImageResult>;
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

type CmsEnhancedConfig = Omit<CmsConfig, "logo" | "footerLogo" | "id"> & {
  logo?: GetImageResult | undefined | null;
  footerLogo?: GetImageResult | undefined | null;
};

type AstroConfig = RecursivelyReplaceType<InferEntrySchema<"config">, Image, GetImageResult>;
type ConfigDiff = RecursiveDiff<CmsEnhancedConfig, AstroConfig>;
AssertTrue<IfEquals<ConfigDiff, never>>();

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
async function optimizeImage(path: string, width: number): Promise<GetImageResult> {
  const meta = resolveImage(path);
  if (!meta) {
    return { src: path, options: { width, format: "webp" } };
  }
  const optimized = await getImage({ src: meta, width, format: "webp" });
  return optimized;
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

export const getProducts = async (): Promise<CmsEnhancedProduct[]> => {
  const response = await client.queries.productConnection();

  const products = nodesFrom(response.data.productConnection).toSorted((a, b) =>
    a.title.localeCompare(b.title)
  );

  const result: RecursiveRequired<CmsEnhancedProduct, GetImageResult | Date>[] = [];

  for (const product of products) {
    result.push({
      product_id: product.product_id,
      title: product.title,
      hidden_in_product_list: product.hidden_in_product_list ?? undefined,
      can_be_ordered: product.can_be_ordered ?? undefined,
      categories: product.categories ?? undefined,
      date: product.date ? new Date(product.date) : undefined,
      thumbnail: product.thumbnail ? await optimizeImage(product.thumbnail, LOGO_WIDTH) : undefined,
      shortDescription: product.shortDescription ?? undefined,
      icon: product.icon ? await optimizeImage(product.icon, LOGO_WIDTH) : undefined,
      priced_by_length: product.priced_by_length ?? undefined,
      price: product.price ?? undefined,
      discount: product.discount ?? undefined,
      discount_valid_until: product.discount_valid_until
        ? new Date(product.discount_valid_until)
        : undefined,
      images: await Promise.all(
        (product.images ?? [])
          .filter((image) => image != null)
          .map(async (image) => ({
            image: image.image ? await optimizeImage(image.image, LOGO_WIDTH) : undefined,
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
                price: material.price ?? undefined,
                color_count: material.color_count ?? undefined,
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
        material_required_count: product.materials?.material_required_count ?? undefined,
      },
      table:
        product.table
          ?.filter((row) => row != null)
          .map((row) => ({
            description: row.description ?? undefined,
            title: row.title ?? undefined,
          })) ?? undefined,
    });
  }

  return result;
};

const transformMaterial = async (
  material: CmsOriginalMaterial
): Promise<RecursiveRequired<CmsEnhancedMaterial, GetImageResult>> => {
  return {
    material_id: material.material_id,
    label: material.label,
    categories: material.categories ?? undefined,
    shortDescription: material.shortDescription ?? undefined,
    thumbnail: material.thumbnail ? await optimizeImage(material.thumbnail, LOGO_WIDTH) : undefined,
    colors: material.colors
      ? await Promise.all(
          material.colors
            .filter((color) => color != null)
            .map(async (color) => ({
              color_id: color.color_id,
              label: color.label,
              hex: color.hex ?? undefined,
              image: color.image ? await optimizeImage(color.image, SWATCH_WIDTH) : undefined,
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

  const result: RecursiveRequired<CmsEnhancedMaterial, GetImageResult>[] = [];

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
