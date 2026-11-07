import { MigrationInterface, QueryRunner } from "typeorm";

export class FlattenRelatedGroups1794100000000 implements MigrationInterface {
  // The "Kapcsolódó termékek" parent outlived its purpose: sets moved to
  // promotions (ADR 0014), so nothing groups under it any more. Its children
  // become private top-level collections — the group kind the shop API
  // resolves from `isPrivate` at the root — and the parent is deleted. The
  // recompute job never ran after the empty filter left the parent, so the
  // children's stored contents are still zero; the migration fills them from
  // each private collection's own product-id-filter, matching what the job
  // would compute.
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      UPDATE collection
      SET "parentId" = (
        SELECT p."parentId" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      )
      WHERE "parentId" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      )
    `);

    await queryRunner.query(`
      DELETE FROM collection_closure
      WHERE "id_ancestor" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      ) OR "id_descendant" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      )
    `);
    await queryRunner.query(`
      DELETE FROM collection_channels_channel
      WHERE "collectionId" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      )
    `);
    await queryRunner.query(`
      DELETE FROM collection_asset
      WHERE "collectionId" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      )
    `);
    await queryRunner.query(`
      DELETE FROM collection
      WHERE "id" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      )
    `);

    await queryRunner.query(`
      DELETE FROM collection_product_variants_product_variant
      WHERE "collectionId" IN (
        SELECT c."id" FROM collection c WHERE c."isPrivate"
      )
    `);
    await queryRunner.query(`
      INSERT INTO collection_product_variants_product_variant ("collectionId", "productVariantId")
      SELECT c."id", pv."id"
      FROM collection c
      JOIN collection_translation t ON t."baseId" = c."id" AND t."languageCode" = 'hu'
      JOIN LATERAL jsonb_array_elements(c."filters"::jsonb) f ON f->>'code' = 'product-id-filter'
      CROSS JOIN LATERAL jsonb_array_elements_text(
        (f->'args'->0->>'value')::jsonb
      ) AS pid(value)
      JOIN product_variant pv ON pv."productId" = (pid.value)::integer
      WHERE c."isPrivate"
      ON CONFLICT DO NOTHING
    `);
  }

  // Not restorable from the database alone: the parent carried no data of its
  // own beyond its name, and the contents are derivable from the filters.
  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `DO $$ BEGIN RAISE EXCEPTION 'related-group flattening is not reversible'; END $$;`,
      undefined
    );
  }
}
