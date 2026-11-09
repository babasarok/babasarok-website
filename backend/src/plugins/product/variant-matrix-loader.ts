/**
 * Loads a native product's full variant matrix with the relations the sync
 * and the drift hash read, as one flat query per relation grouped by variant
 * id. TypeORM's relation hydration is unusable at this size: the join strategy
 * multiplies rows (options × translations × prices per
 * variant — 334k rows for babafeszek's 1 152 variants) and the query strategy
 * matches every relation row against every variant (RelationIdLoader, ~63M
 * comparisons — 10 s of blocked event loop per call).
 */
import type { EntityManager } from "typeorm";
import { GlobalFlag } from "@vendure/common/lib/generated-types";
import { LanguageCode } from "@vendure/core";
import { z } from "zod";

export interface MatrixVariant {
  id: number;
  sku: string;
  trackInventory: GlobalFlag;
  options: Array<{ id: number; code: string; groupCode: string }>;
  translations: Array<{ languageCode: LanguageCode; name: string }>;
  prices: Array<{ channelId: number; price: number }>;
}

const VariantRow = z.object({
  id: z.number(),
  sku: z.string(),
  trackInventory: z.enum(GlobalFlag),
});
const OptionRow = z.object({
  variantId: z.number(),
  id: z.number(),
  code: z.string(),
  groupCode: z.string(),
});
const TranslationRow = z.object({
  variantId: z.number(),
  languageCode: z.enum(LanguageCode),
  name: z.string(),
});
const PriceRow = z.object({ variantId: z.number(), channelId: z.number(), price: z.number() });

/** Each relation query takes the product id; the variant filter is shared. */
const VARIANTS_OF = `select id from product_variant where "productId" = $1 and "deletedAt" is null`;

async function rows<T>(
  manager: EntityManager,
  schema: z.ZodType<T>,
  sql: string,
  productId: number
): Promise<T[]> {
  return z.array(schema).parse(await manager.query(sql, [productId]));
}

function groupByVariant<T extends { variantId: number }>(
  list: readonly T[]
): Map<number, Array<Omit<T, "variantId">>> {
  const grouped = new Map<number, Array<Omit<T, "variantId">>>();

  for (const { variantId, ...rest } of list) {
    const bucket = grouped.get(variantId);

    if (bucket === undefined) {
      grouped.set(variantId, [rest]);
      continue;
    }

    bucket.push(rest);
  }

  return grouped;
}

export async function loadVariantMatrix(
  manager: EntityManager,
  productId: number
): Promise<MatrixVariant[]> {
  // Sequential: inside the sync's transaction every query shares one pg
  // client, where concurrent queries only queue (and pg deprecates it).
  const variants = await rows(
    manager,
    VariantRow,
    `select id, sku, "trackInventory" from product_variant
     where "productId" = $1 and "deletedAt" is null order by id`,
    productId
  );
  const options = await rows(
    manager,
    OptionRow,
    `select j."productVariantId" as "variantId", o.id, o.code, g.code as "groupCode"
     from product_variant_options_product_option j
     join product_option o on o.id = j."productOptionId"
     join product_option_group g on g.id = o."groupId"
     where j."productVariantId" in (${VARIANTS_OF}) order by o.id`,
    productId
  );
  const translations = await rows(
    manager,
    TranslationRow,
    `select "baseId" as "variantId", "languageCode", name from product_variant_translation
     where "baseId" in (${VARIANTS_OF}) order by id`,
    productId
  );
  const prices = await rows(
    manager,
    PriceRow,
    `select "variantId", "channelId", price from product_variant_price
     where "variantId" in (${VARIANTS_OF}) order by id`,
    productId
  );

  const optionsOf = groupByVariant(options);
  const translationsOf = groupByVariant(translations);
  const pricesOf = groupByVariant(prices);

  return variants.map((variant) => ({
    ...variant,
    options: optionsOf.get(variant.id) ?? [],
    translations: translationsOf.get(variant.id) ?? [],
    prices: pricesOf.get(variant.id) ?? [],
  }));
}
