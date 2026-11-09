import type { z } from "zod";
import { CATALOG_LANGUAGE, shopQuery } from "@/lib/vendure/client";
import type { ShopQuery } from "@/lib/vendure/transport";
import {
  toMaterial,
  toProduct,
  toProductDetail,
  toProductGroups,
  toThreadColors,
  type CatalogMaterial,
  type CatalogProduct,
  type CatalogProductDetail,
  type CatalogProductGroup,
  type CatalogThreadColor,
} from "./mappers";
import {
  CATALOG_QUERY,
  MATERIAL_QUERY,
  MATERIALS_QUERY,
  PRODUCT_QUERY,
  PRODUCTS_QUERY,
} from "./queries";
import {
  CatalogResponseSchema,
  MaterialResponseSchema,
  MaterialsResponseSchema,
  ProductResponseSchema,
  ProductsResponseSchema,
} from "./schemas";

export { byPopularity } from "./mappers";
export type {
  CatalogMaterial,
  CatalogProduct,
  CatalogProductDetail,
  CatalogProductGroup,
  CatalogThreadColor,
} from "./mappers";

const PAGE_SIZE = 100;

type ProductsPage = z.output<typeof ProductsResponseSchema>["products"];

export interface Catalog {
  products: CatalogProduct[];
  materials: CatalogMaterial[];
  threadColors: CatalogThreadColor[];
  groups: CatalogProductGroup[];
}

async function productsFrom(
  firstPage: ProductsPage,
  run: ShopQuery,
  languageCode: string
): Promise<CatalogProduct[]> {
  const rows = [...firstPage.items];
  let page = firstPage;

  while (page.items.length > 0 && rows.length < page.totalItems) {
    ({ products: page } = await run({
      query: PRODUCTS_QUERY,
      variables: { skip: rows.length, take: PAGE_SIZE },
      schema: ProductsResponseSchema,
      languageCode,
    }));
    rows.push(...page.items);
  }

  return rows.flatMap((row) => toProduct(row) ?? []);
}

export async function getProducts(
  run: ShopQuery = shopQuery,
  languageCode: string = CATALOG_LANGUAGE
): Promise<CatalogProduct[]> {
  const { products } = await run({
    query: PRODUCTS_QUERY,
    variables: { skip: 0, take: PAGE_SIZE },
    schema: ProductsResponseSchema,
    languageCode,
  });

  return productsFrom(products, run, languageCode);
}

/** Everything the catalog pages share, in one request (plus product pages past the first). */
export async function getCatalog(
  run: ShopQuery = shopQuery,
  languageCode: string = CATALOG_LANGUAGE
): Promise<Catalog> {
  const response = await run({
    query: CATALOG_QUERY,
    variables: { skip: 0, take: PAGE_SIZE },
    schema: CatalogResponseSchema,
    languageCode,
  });

  return {
    products: await productsFrom(response.products, run, languageCode),
    materials: response.materials.map(toMaterial),
    threadColors: toThreadColors(response),
    groups: toProductGroups(response),
  };
}

export async function getProduct(
  slug: string,
  run: ShopQuery = shopQuery,
  languageCode: string = CATALOG_LANGUAGE
): Promise<CatalogProductDetail | null> {
  const { product } = await run({
    query: PRODUCT_QUERY,
    variables: { slug },
    schema: ProductResponseSchema,
    languageCode,
  });

  if (product === null) {
    return null;
  }

  return toProductDetail(product);
}

export async function getMaterials(
  run: ShopQuery = shopQuery,
  languageCode: string = CATALOG_LANGUAGE
): Promise<CatalogMaterial[]> {
  const { materials } = await run({
    query: MATERIALS_QUERY,
    schema: MaterialsResponseSchema,
    languageCode,
  });

  return materials.map(toMaterial);
}

export async function getMaterial(
  slug: string,
  run: ShopQuery = shopQuery,
  languageCode: string = CATALOG_LANGUAGE
): Promise<CatalogMaterial | null> {
  const { material } = await run({
    query: MATERIAL_QUERY,
    variables: { slug },
    schema: MaterialResponseSchema,
    languageCode,
  });

  return material === null ? null : toMaterial(material);
}
