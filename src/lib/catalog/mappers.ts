import type { z } from "zod";
import type { ProductDefinition } from "@babasarok/product-definition";
import type { VendureAsset } from "@/lib/vendure/imageUrl";
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

/** How a product is ordered: through its configurator definition, or as-is from the variant. */
export type CatalogProductOrdering =
  | { kind: "configurable"; definition: ProductDefinition }
  | {
      kind: "ready-made";
      unitPriceWithTax: number;
      currencyCode: string;
      /** Real stock the storefront may show and cap the quantity at; null when untracked. */
      saleableStock: number | null;
    };

export type ConfigurableCatalogProduct = CatalogProduct & {
  ordering: Extract<CatalogProductOrdering, { kind: "configurable" }>;
};

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  shortDescription: string | null;
  date: string | null;
  popularityRank: number | null;
  thumbnail: VendureAsset | null;
  type: { code: string; name: string } | null;
  ordering: CatalogProductOrdering;
}

export type CatalogProductGroup = z.output<
  typeof ProductGroupsResponseSchema
>["productGroups"][number];

export interface CatalogProductDetail extends CatalogProduct {
  description: string;
  gallery: Array<{ asset: VendureAsset; description: string | null }>;
}

export interface CatalogMaterial {
  slug: string;
  label: string;
  subtitle: string;
  description: string;
  thumbnail: VendureAsset | null;
  colors: Array<{ id: string; label: string; hex: string | null; image: VendureAsset | null }>;
}

/** The products ordered through a configurator definition; ready-made ones are excluded. */
export function configurableProducts(
  products: readonly CatalogProduct[]
): ConfigurableCatalogProduct[] {
  return products.filter(
    (product): product is ConfigurableCatalogProduct => product.ordering.kind === "configurable"
  );
}

/**
 * Null for a sold-out ready-made product (and a definition-less product with
 * no variant): not storefront products.
 */
export function toProduct(row: ProductRow): CatalogProduct | null {
  const ordering = orderingOf(row);

  if (ordering === null) {
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
    thumbnail: row.featuredAsset ?? null,
    type: type === undefined ? null : { code: type.code, name: type.name },
    ordering,
  };
}

function orderingOf(row: ProductRow): CatalogProductOrdering | null {
  if (row.productDefinition !== null) {
    return { kind: "configurable", definition: row.productDefinition };
  }

  const variant = row.variants.at(0);

  if (variant === undefined || variant.stockLevel === "OUT_OF_STOCK") {
    return null;
  }

  return {
    kind: "ready-made",
    unitPriceWithTax: variant.priceWithTax,
    currencyCode: variant.currencyCode,
    saleableStock: variant.saleableStock,
  };
}

export function toProductDetail(row: DetailRow): CatalogProductDetail | null {
  const product = toProduct(row);

  if (product === null) {
    return null;
  }

  return {
    ...product,
    description: row.description,
    gallery: row.assets.map((asset) => ({
      asset,
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
    thumbnail: row.thumbnail ?? null,
    colors: row.colors.map((color) => ({
      id: color.id,
      label: color.label,
      hex: color.hex,
      image: color.asset ?? null,
    })),
  };
}

export interface CatalogThreadColor {
  id: string;
  label: string;
  hex: string | null;
  swatch: VendureAsset | null;
}

export function toThreadColors(
  response: z.output<typeof ThreadColorsResponseSchema>
): CatalogThreadColor[] {
  return response.threadColors.map((color) => ({
    id: color.id,
    label: color.label,
    hex: color.hex,
    swatch: color.swatch ?? null,
  }));
}

export function toProductGroups(
  response: z.output<typeof ProductGroupsResponseSchema>
): z.output<typeof ProductGroupsResponseSchema>["productGroups"] {
  return response.productGroups;
}

/** Ranked products first (1 = most popular), unranked after, each block in input order. */
export function byPopularity<T extends { popularityRank: number | null }>(
  products: readonly T[]
): T[] {
  const ranked = products.filter((product) => product.popularityRank !== null);
  const unranked = products.filter((product) => product.popularityRank === null);

  ranked.sort((a, b) => (a.popularityRank ?? 0) - (b.popularityRank ?? 0));

  return [...ranked, ...unranked];
}
