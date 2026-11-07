import { MigrationInterface, QueryRunner } from "typeorm";

export class SetDiscountsAsPromotions1794000000000 implements MigrationInterface {
  // ADR 0014: a discounted set is one Promotion — members from the condition
  // args, the flat Ft amount on the action, the Hungarian name as the set
  // label. The old argless "Szett kedvezmény" promotion and the Szettek
  // collection tree retire; each discounted child of the "Szettek" parent
  // becomes its own promotion with the same members and amount. The related
  // parent keeps its role, minus its empty product-id-filter, whose inherited
  // emptiness kept every group collection's contents at zero.
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      DO $$
      DECLARE
        row RECORD;
        promo_id INTEGER;
      BEGIN
        FOR row IN
          SELECT
            (SELECT arg->>'value' FROM jsonb_array_elements(c."filters"::jsonb->0->'args') arg
              WHERE arg->>'name' = 'productIds') AS member_ids,
            c."customFieldsSetdiscount" AS discount,
            t."name" AS name
          FROM collection c
          JOIN collection_translation t ON t."baseId" = c."id" AND t."languageCode" = 'hu'
          WHERE c."parentId" = (
            SELECT p."id" FROM collection p
            JOIN collection_translation pt ON pt."baseId" = p."id" AND pt."slug" = 'szettek'
            LIMIT 1
          ) AND c."customFieldsSetdiscount" > 0
        LOOP
          INSERT INTO promotion ("createdAt", "updatedAt", "enabled", "conditions", "actions", "priorityScore")
          VALUES (
            now(), now(), true,
            jsonb_build_array(jsonb_build_object('code', 'babasarok-product-set-members', 'args',
              jsonb_build_array(jsonb_build_object('name', 'productIds', 'value', row."member_ids"))))::text,
            jsonb_build_array(jsonb_build_object('code', 'babasarok-product-set-discount', 'args',
              jsonb_build_array(jsonb_build_object('name', 'amount', 'value', row."discount"::text))))::text,
            0
          )
          RETURNING "id" INTO promo_id;

          INSERT INTO promotion_translation ("createdAt", "updatedAt", "languageCode", "name", "description", "baseId")
          VALUES (now(), now(), 'hu', row."name", '', promo_id);

          INSERT INTO promotion_channels_channel ("promotionId", "channelId")
          SELECT promo_id, "id" FROM channel WHERE "code" = '__default_channel__';
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      DELETE FROM promotion_channels_channel
      WHERE "promotionId" IN (
        SELECT "id" FROM promotion WHERE "conditions"::text LIKE '%babasarok-product-set-basket%'
      )
    `);
    await queryRunner.query(`
      DELETE FROM promotion_translation
      WHERE "baseId" IN (
        SELECT "id" FROM promotion WHERE "conditions"::text LIKE '%babasarok-product-set-basket%'
      )
    `);
    await queryRunner.query(`
      DELETE FROM promotion
      WHERE "conditions"::text LIKE '%babasarok-product-set-basket%'
    `);

    await queryRunner.query(
      `ALTER TABLE "collection" DROP COLUMN IF EXISTS "customFieldsSetdiscount"`,
      undefined
    );

    await queryRunner.query(`
      UPDATE collection
      SET "filters" = '[]'
      WHERE "id" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'kapcsolodo-termekek'
      ) AND "filters"::jsonb->0->'args'->0->>'value' = '[]'
    `);

    await queryRunner.query(`
      DELETE FROM collection
      WHERE "parentId" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'szettek'
      )
    `);
    await queryRunner.query(`
      DELETE FROM collection
      WHERE "id" IN (
        SELECT p."id" FROM collection p
        JOIN collection_translation t ON t."baseId" = p."id" AND t."slug" = 'szettek'
      )
    `);
  }

  // Not restorable from the database alone: the promotions carry everything
  // the collections held (members and amount), but re-creating the tree would
  // duplicate the source of truth. Restore from a backup instead.
  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `DO $$ BEGIN RAISE EXCEPTION 'ADR 0014 migration is not reversible'; END $$;`,
      undefined
    );
  }
}
