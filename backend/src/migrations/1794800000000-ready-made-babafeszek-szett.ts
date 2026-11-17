import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Turns the Babafészek szett into a ready-made product (ADR 0018): the
 * one-off piece is sold as-is, not configured, so its canonical definition
 * ("méret: Normál" — the only field — plus the base price the sync already
 * wrote onto the variant) is dropped, and the single native variant takes
 * over: inventory tracking is re-enabled (the sync had set `trackInventory`
 * FALSE) and the stock is set to the one piece that physically exists. The
 * product itself stays disabled — the owner enables it when the rollout
 * starts, after assigning a product type and checking the gallery.
 *
 * Idempotent: the temp table selects the definition only while it exists, so
 * every statement is a no-op after the first run.
 */
export const READY_MADE_BABAFESZEK_SZETT_STATEMENTS: readonly string[] = [
  `CREATE TEMP TABLE ready_made_babafeszek_szett ON COMMIT DROP AS
   SELECT d."nativeProductId" AS product_id
   FROM product_definition d
   WHERE d."productId" = 'babafeszek-szett' AND d."nativeProductId" IS NOT NULL`,

  `DELETE FROM product_definition d
   USING ready_made_babafeszek_szett a
   WHERE d."productId" = 'babafeszek-szett'`,

  `UPDATE product_variant v SET "trackInventory" = 'INHERIT'
   FROM ready_made_babafeszek_szett a
   WHERE v."productId" = a.product_id AND v."deletedAt" IS NULL`,

  `UPDATE stock_level sl SET "stockOnHand" = 1
   FROM ready_made_babafeszek_szett a, product_variant v
   WHERE v."productId" = a.product_id AND v."deletedAt" IS NULL
     AND sl."productVariantId" = v.id`,

  `INSERT INTO stock_level ("createdAt", "updatedAt", "stockOnHand", "stockAllocated", "productVariantId", "stockLocationId")
   SELECT now(), now(), 1, 0, v.id, (SELECT id FROM stock_location ORDER BY id LIMIT 1)
   FROM ready_made_babafeszek_szett a
   JOIN product_variant v ON v."productId" = a.product_id AND v."deletedAt" IS NULL
   WHERE NOT EXISTS (
     SELECT 1 FROM stock_level sl WHERE sl."productVariantId" = v.id
   )`,
];

const RESTORED_DEFINITION = `{"id": "babafeszek-szett", "fields": [{"id": "meret", "kind": "choice", "label": {"hu": "Méret"}, "options": [{"id": "normal", "label": {"hu": "Normál"}, "price": 0, "tooltip": {"hu": "kb. 35x65cm fekvő felület"}}], "visibility": {"kind": "always"}, "presentation": "select"}], "pricing": {"kind": "unit"}, "basePrice": 21500, "forbiddenMaterialCombinations": []}`;

export class ReadyMadeBabafeszekSzett1794800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    for (const statement of READY_MADE_BABAFESZEK_SZETT_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    // Restores the configurator product: the definition comes back (its
    // revision hash is recomputed by the next dashboard save), the variant
    // goes back to the sync's untracked no-stock state.
    await queryRunner.query(
      `INSERT INTO product_definition ("createdAt", "updatedAt", "productId", "definition", "nativeProductId", "syncState")
       SELECT now(), now(), 'babafeszek-szett', '${RESTORED_DEFINITION.replaceAll("'", "''")}', p.id, 'synced'
       FROM product p
       JOIN product_translation t ON t."baseId" = p.id AND t.slug = 'babafeszek-szett'
       WHERE NOT EXISTS (SELECT 1 FROM product_definition WHERE "productId" = 'babafeszek-szett')`
    );

    for (const statement of [
      `UPDATE product_variant v SET "trackInventory" = 'FALSE'
       FROM product_definition d
       WHERE d."productId" = 'babafeszek-szett' AND v."productId" = d."nativeProductId"`,

      `UPDATE stock_level sl SET "stockOnHand" = 0
       FROM product_definition d, product_variant v
       WHERE d."productId" = 'babafeszek-szett' AND v."productId" = d."nativeProductId"
         AND sl."productVariantId" = v.id`,
    ]) {
      await queryRunner.query(statement);
    }
  }
}
