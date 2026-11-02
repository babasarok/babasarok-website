import type { z } from "zod";
import type { ProductDefinition } from "@babasarok/product-definition";
import type {
  MaterialsResponseSchema,
  ProductGroupsResponseSchema,
  ProductResponseSchema,
  ProductsResponseSchema,
  ThreadColorsResponseSchema,
} from "./schemas";

const PRODUCT_TYPE_FACET_CODE = "babasarok-product-type";

type ProductRow = z.output<typeof ProductsResponseSchema>["products"]["items"][number];
type DetailRow = NonNullable<z.output<typeof ProductResponseSchema>["product"]>;
type MaterialRow = z.output<typeof MaterialsResponseSchema>["materials"][number];

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  shortDescription: string | null;
  date: string | null;
  popularityRank: number | null;
  thumbnailUrl: string | null;
  type: { code: string; name: string } | null;
  definition: ProductDefinition;
}

export type CatalogProductGroup = z.output<
  typeof ProductGroupsResponseSchema
>["productGroups"][number];

export interface CatalogProductDetail extends CatalogProduct {
  gallery: Array<{ url: string; description: string | null }>;
}

export interface CatalogMaterial {
  slug: string;
  label: string;
  subtitle: string;
  description: string;
  thumbnailUrl: string | null;
  colors: Array<{ id: string; label: string; hex: string | null; imageUrl: string | null }>;
}

/** Null for products without a configurator definition (e.g. quote-order placeholders): not storefront products. */
export function toProduct(row: ProductRow): CatalogProduct | null {
  if (row.productDefinition === null) {
    return null;
  }

  const type = row.facetValues.find((value) => value.facet.code === PRODUCT_TYPE_FACET_CODE);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.customFields.tagline,
    shortDescription: row.customFields.shortDescription,
    date: row.customFields.date,
    popularityRank: row.customFields.popularityRank,
    thumbnailUrl: row.featuredAsset?.source ?? null,
    type: type === undefined ? null : { code: type.code, name: type.name },
    definition: row.productDefinition,
  };
}

export function toProductDetail(row: DetailRow): CatalogProductDetail | null {
  const product = toProduct(row);

  if (product === null) {
    return null;
  }

  return {
    ...product,
    gallery: row.assets.map((asset) => ({
      url: asset.source,
      description: asset.customFields?.galleryDescription ?? null,
    })),
  };
}

export function toMaterial(row: MaterialRow): CatalogMaterial {
  return {
    slug: row.slug,
    label: row.label,
    subtitle: row.subtitle,
    description: row.description,
    thumbnailUrl: row.thumbnail?.source ?? null,
    colors: row.colors.map((color) => ({
      id: color.id,
      label: color.label,
      hex: color.hex,
      imageUrl: color.asset?.source ?? null,
    })),
  };
}

export function toThreadColors(
  response: z.output<typeof ThreadColorsResponseSchema>
): Array<{ id: string; label: string; hex: string | null; swatchUrl: string | null }> {
  return response.threadColors.map((color) => ({
    id: color.id,
    label: color.label,
    hex: color.hex,
    swatchUrl: color.swatch?.source ?? null,
  }));
}

export function toProductGroups(
  response: z.output<typeof ProductGroupsResponseSchema>
): z.output<typeof ProductGroupsResponseSchema>["productGroups"] {
  return response.productGroups;
}

/** Ranked products first (1 = most popular), unranked after, each block in input order. */
export function byPopularity(products: readonly CatalogProduct[]): CatalogProduct[] {
  const ranked = products.filter((product) => product.popularityRank !== null);
  const unranked = products.filter((product) => product.popularityRank === null);

  ranked.sort((a, b) => (a.popularityRank ?? 0) - (b.popularityRank ?? 0));

  return [...ranked, ...unranked];
}
