import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ADR 0016 step 5, in order. Every generated product that still carries the
 * variant matrix gets one new variant — the definition id as SKU, the native
 * product's names, the base price, the channels, tax category and stock
 * locations of its lowest-id live variant — and:
 * - lines of active orders move onto it (their stored prices and selections
 *   are untouched; pricing reads the selections, ADR 0016 step 1);
 * - the old variants are soft-deleted, as Vendure's own variant delete does:
 *   placed and cancelled orders keep pointing at them, so their price, stock
 *   level, channel and option rows stay for that history;
 * - their search-index rows and collection memberships move to the new
 *   variant;
 * - the product's option groups and options are soft-deleted and unlinked.
 *
 * Idempotent: a product with one live variant, no option groups and no
 * variant options is left alone, so a re-run changes nothing.
 */
export const ONE_VARIANT_PER_PRODUCT_STATEMENTS: readonly string[] = [
  `CREATE TEMP TABLE adr0016_product ON COMMIT DROP AS
   SELECT pd."productId" AS sku,
     pd."nativeProductId" AS product_id,
     (pd.definition->>'basePrice')::int AS base_price,
     min(v.id) AS template_id,
     NULL::int AS variant_id
   FROM product_definition pd
   JOIN product p ON p.id = pd."nativeProductId" AND p."deletedAt" IS NULL
   JOIN product_variant v ON v."productId" = p.id AND v."deletedAt" IS NULL
   GROUP BY pd."productId", pd."nativeProductId", pd.definition
   HAVING count(v.id) > 1
     OR EXISTS (
       SELECT 1 FROM product_option_groups_product_option_group j
       WHERE j."productId" = pd."nativeProductId"
     )
     OR EXISTS (
       SELECT 1 FROM product_variant_options_product_option o
       JOIN product_variant lv ON lv.id = o."productVariantId"
       WHERE lv."productId" = pd."nativeProductId" AND lv."deletedAt" IS NULL
     )`,

  `WITH inserted AS (
     INSERT INTO product_variant (
       "enabled", "sku", "outOfStockThreshold", "useGlobalOutOfStockThreshold",
       "trackInventory", "taxCategoryId", "productId"
     )
     SELECT true, a.sku, 0, true, 'FALSE', t."taxCategoryId", a.product_id
     FROM adr0016_product a
     JOIN product_variant t ON t.id = a.template_id
     RETURNING id, "productId"
   )
   UPDATE adr0016_product a SET variant_id = inserted.id
   FROM inserted WHERE inserted."productId" = a.product_id`,

  `INSERT INTO product_variant_translation ("languageCode", "name", "baseId")
   SELECT pt."languageCode", pt.name, a.variant_id
   FROM product_translation pt
   JOIN adr0016_product a ON pt."baseId" = a.product_id`,

  `INSERT INTO product_variant_channels_channel ("productVariantId", "channelId")
   SELECT a.variant_id, c."channelId"
   FROM product_variant_channels_channel c
   JOIN adr0016_product a ON c."productVariantId" = a.template_id`,

  `INSERT INTO product_variant_price ("currencyCode", "channelId", "price", "variantId")
   SELECT pr."currencyCode", pr."channelId", a.base_price, a.variant_id
   FROM product_variant_price pr
   JOIN adr0016_product a ON pr."variantId" = a.template_id`,

  `INSERT INTO stock_level ("stockOnHand", "stockAllocated", "productVariantId", "stockLocationId")
   SELECT 0, 0, a.variant_id, s."stockLocationId"
   FROM stock_level s
   JOIN adr0016_product a ON s."productVariantId" = a.template_id`,

  `UPDATE order_line ol SET "productVariantId" = a.variant_id
   FROM product_variant v, adr0016_product a, "order" o
   WHERE ol."productVariantId" = v.id
     AND v."productId" = a.product_id
     AND v.id <> a.variant_id
     AND o.id = ol."orderId"
     AND o.active`,

  `INSERT INTO collection_product_variants_product_variant ("collectionId", "productVariantId")
   SELECT DISTINCT c."collectionId", a.variant_id
   FROM collection_product_variants_product_variant c
   JOIN product_variant v ON v.id = c."productVariantId"
   JOIN adr0016_product a ON a.product_id = v."productId"
   ON CONFLICT DO NOTHING`,

  `DELETE FROM collection_product_variants_product_variant c
   USING product_variant v, adr0016_product a
   WHERE c."productVariantId" = v.id
     AND v."productId" = a.product_id
     AND v.id <> a.variant_id`,

  `INSERT INTO search_index_item (
     "languageCode", "enabled", "productName", "productVariantName", "description", "slug",
     "sku", "facetIds", "facetValueIds", "collectionIds", "collectionSlugs", "channelIds",
     "productPreview", "productPreviewFocalPoint", "productVariantPreview",
     "productVariantPreviewFocalPoint", "productVariantId", "channelId", "productId",
     "productAssetId", "productVariantAssetId", "price", "priceWithTax"
   )
   SELECT s."languageCode", s."enabled", s."productName", coalesce(t.name, s."productName"),
     s."description", s."slug", a.sku, s."facetIds", s."facetValueIds", s."collectionIds",
     s."collectionSlugs", s."channelIds", s."productPreview", s."productPreviewFocalPoint", '',
     NULL, a.variant_id, s."channelId", s."productId", s."productAssetId", NULL,
     CASE WHEN s."priceWithTax" = 0 OR s.price = s."priceWithTax" THEN a.base_price
       ELSE round(a.base_price * s.price::numeric / s."priceWithTax")::int END,
     a.base_price
   FROM search_index_item s
   JOIN adr0016_product a ON s."productVariantId" = a.template_id
   LEFT JOIN product_variant_translation t
     ON t."baseId" = a.variant_id AND t."languageCode" = s."languageCode"`,

  `DELETE FROM search_index_item s
   USING product_variant v, adr0016_product a
   WHERE s."productVariantId" = v.id
     AND v."productId" = a.product_id
     AND v.id <> a.variant_id`,

  `UPDATE product_variant v SET "deletedAt" = now()
   FROM adr0016_product a
   WHERE v."productId" = a.product_id AND v.id <> a.variant_id AND v."deletedAt" IS NULL`,

  `UPDATE product_option o SET "deletedAt" = now()
   FROM product_option_groups_product_option_group j, adr0016_product a
   WHERE j."productId" = a.product_id
     AND o."groupId" = j."productOptionGroupId"
     AND o."deletedAt" IS NULL`,

  `UPDATE product_option_group g SET "deletedAt" = now()
   FROM product_option_groups_product_option_group j, adr0016_product a
   WHERE j."productId" = a.product_id
     AND g.id = j."productOptionGroupId"
     AND g."deletedAt" IS NULL`,

  `DELETE FROM product_option_groups_product_option_group j
   USING adr0016_product a
   WHERE j."productId" = a.product_id`,

  `UPDATE product_definition pd SET "syncState" = 'synced', "syncError" = NULL
   FROM adr0016_product a
   WHERE pd."productId" = a.sku`,

  `ALTER TABLE product_definition
     DROP COLUMN IF EXISTS "syncedNativeStateHash",
     DROP COLUMN IF EXISTS "syncedDefinitionHash"`,
];

export class OneVariantPerProduct1794400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    for (const statement of ONE_VARIANT_PER_PRODUCT_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `DO $$ BEGIN RAISE EXCEPTION 'ADR 0016 has no path back to the variant matrix'; END $$;`,
      undefined
    );
  }
}
