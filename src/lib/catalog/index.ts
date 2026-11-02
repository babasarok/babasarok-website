import { shopQuery } from "@/lib/vendure/client";
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
} from "./mappers";
import {
  MATERIAL_QUERY,
  MATERIALS_QUERY,
  PRODUCT_GROUPS_QUERY,
  PRODUCT_QUERY,
  PRODUCTS_QUERY,
  THREAD_COLORS_QUERY,
} from "./queries";
import {
  MaterialResponseSchema,
  MaterialsResponseSchema,
  ProductGroupsResponseSchema,
  ProductResponseSchema,
  ProductsResponseSchema,
  ThreadColorsResponseSchema,
} from "./schemas";

export { byPopularity } from "./mappers";
export type {
  CatalogMaterial,
  CatalogProduct,
  CatalogProductDetail,
  CatalogProductGroup,
} from "./mappers";

const PAGE_SIZE = 100;

export async function getProducts(run: ShopQuery = shopQuery): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = [];
  let fetched = 0;

  for (;;) {
    const { products: page } = await run({
      query: PRODUCTS_QUERY,
      variables: { skip: fetched, take: PAGE_SIZE },
      schema: ProductsResponseSchema,
    });

    fetched += page.items.length;
    products.push(...page.items.flatMap((row) => toProduct(row) ?? []));

    if (page.items.length === 0 || fetched >= page.totalItems) {
      return products;
    }
  }
}

export async function getProduct(
  slug: string,
  run: ShopQuery = shopQuery
): Promise<CatalogProductDetail | null> {
  const { product } = await run({
    query: PRODUCT_QUERY,
    variables: { slug },
    schema: ProductResponseSchema,
  });

  if (product === null) {
    return null;
  }

  return toProductDetail(product);
}

export async function getMaterials(run: ShopQuery = shopQuery): Promise<CatalogMaterial[]> {
  const { materials } = await run({ query: MATERIALS_QUERY, schema: MaterialsResponseSchema });

  return materials.map(toMaterial);
}

export async function getMaterial(
  slug: string,
  run: ShopQuery = shopQuery
): Promise<CatalogMaterial | null> {
  const { material } = await run({
    query: MATERIAL_QUERY,
    variables: { slug },
    schema: MaterialResponseSchema,
  });

  return material === null ? null : toMaterial(material);
}

export async function getThreadColors(
  run: ShopQuery = shopQuery
): Promise<ReturnType<typeof toThreadColors>> {
  return toThreadColors(
    await run({ query: THREAD_COLORS_QUERY, schema: ThreadColorsResponseSchema })
  );
}

export async function getProductGroups(
  run: ShopQuery = shopQuery
): Promise<ReturnType<typeof toProductGroups>> {
  return toProductGroups(
    await run({ query: PRODUCT_GROUPS_QUERY, schema: ProductGroupsResponseSchema })
  );
}
