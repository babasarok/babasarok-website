import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Retires ADR 0007 decision 3's placeholder catalog: the `[placeholder]`
 * products and variants the removed legacy quote-order path created for
 * unseen slugs are soft-deleted, and their search-index rows are deleted, so
 * they leave the admin product list and the shop API.
 *
 * Orders keep every line that references them: the soft delete is what
 * Vendure's own product delete does, so the variants' price, translation,
 * channel and stock rows stay, and placed and cancelled orders keep rendering
 * their stored snapshots.
 *
 * Idempotent: a product is selected only while it still has a live
 * `placeholder-` variant, and already soft-deleted rows are skipped, so a
 * re-run changes nothing.
 */
export const RETIRE_PLACEHOLDER_PRODUCTS_STATEMENTS: readonly string[] = [
  `CREATE TEMP TABLE retire_placeholder_product ON COMMIT DROP AS
   SELECT DISTINCT p.id AS product_id
   FROM product_variant v
   JOIN product p ON p.id = v."productId" AND p."deletedAt" IS NULL
   JOIN product_translation t ON t."baseId" = p.id
   WHERE v.sku ILIKE 'placeholder-%'
     AND v."deletedAt" IS NULL
     AND t.slug ILIKE 'placeholder-%'`,

  `UPDATE product_variant v SET "deletedAt" = now()
   FROM retire_placeholder_product a
   WHERE v."productId" = a.product_id AND v."deletedAt" IS NULL`,

  `UPDATE product p SET "deletedAt" = now()
   FROM retire_placeholder_product a
   WHERE p.id = a.product_id AND p."deletedAt" IS NULL`,

  `DELETE FROM search_index_item s
   USING retire_placeholder_product a
   WHERE s."productId" = a.product_id`,
];

export class RetirePlaceholderProducts1794500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    for (const statement of RETIRE_PLACEHOLDER_PRODUCTS_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    // Reverses the soft delete. The deleted search-index rows come back only
    // with an admin `reindex`, the same way Vendure restores visibility after
    // a bulk write.
    await queryRunner.query(`
      UPDATE product_variant v SET "deletedAt" = NULL
      FROM product p, product_translation t
      WHERE v."productId" = p.id
        AND t."baseId" = p.id
        AND v.sku ILIKE 'placeholder-%'
        AND t.slug ILIKE 'placeholder-%'
    `);
    await queryRunner.query(`
      UPDATE product p SET "deletedAt" = NULL
      FROM product_translation t
      WHERE t."baseId" = p.id AND t.slug ILIKE 'placeholder-%'
    `);
  }
}
