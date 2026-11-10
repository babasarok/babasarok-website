import { z } from "zod";
import { ProductDefinitionSchema } from "@babasarok/product-definition";

const AssetSchema = z.object({ source: z.string() });

const ProductRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  customFields: z.object({
    shortDescription: z.string().nullable(),
    tagline: z.string().nullable(),
    date: z.string().nullable(),
    popularityRank: z.number().int().nullable(),
  }),
  featuredAsset: AssetSchema.nullable(),
  facetValues: z.array(
    z.object({ code: z.string(), name: z.string(), facet: z.object({ code: z.string() }) })
  ),
  productDefinition: ProductDefinitionSchema.nullable(),
});

export const ProductsResponseSchema = z.object({
  products: z.object({ totalItems: z.number().int(), items: z.array(ProductRowSchema) }),
});

export const ProductResponseSchema = z.object({
  product: ProductRowSchema.extend({
    description: z.string(),
    assets: z.array(
      z.object({
        source: z.string(),
        customFields: z.object({ galleryDescription: z.string().nullable() }).nullable(),
      })
    ),
  }).nullable(),
});

const MaterialRowSchema = z.object({
  slug: z.string(),
  label: z.string(),
  subtitle: z.string(),
  description: z.string(),
  thumbnail: AssetSchema.nullable(),
  colors: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      hex: z.string().nullable(),
      asset: AssetSchema.nullable(),
    })
  ),
});

export const MaterialsResponseSchema = z.object({ materials: z.array(MaterialRowSchema) });

export const MaterialResponseSchema = z.object({ material: MaterialRowSchema.nullable() });

export const ThreadColorsResponseSchema = z.object({
  threadColors: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      hex: z.string().nullable(),
      swatch: AssetSchema.nullable(),
    })
  ),
});

export const ProductGroupsResponseSchema = z.object({
  productGroups: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["set", "related"]),
      label: z.string(),
      discount: z.number().int().nullable(),
      productIds: z.array(z.string()),
    })
  ),
});

export const CatalogResponseSchema = z.object({
  ...ProductsResponseSchema.shape,
  ...MaterialsResponseSchema.shape,
  ...ThreadColorsResponseSchema.shape,
  ...ProductGroupsResponseSchema.shape,
});
