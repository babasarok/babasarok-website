import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMaterialTables1793541818426 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    // Squash of the branch's earlier material migrations. Dev databases that
    // already ran the old string-id chain get their tables rebuilt in place:
    // the old string id becomes the slug and numeric ids are assigned in the
    // old id's order, so existing rows (seeded or hand-created) survive.
    await queryRunner.query(
      `DO $$ BEGIN
        IF to_regclass('public.material') IS NOT NULL THEN
          ALTER TABLE "material" RENAME TO "material_legacy";
          -- The legacy constraints carry the same generated names the new
          -- tables need, so they must move aside before CREATE TABLE.
          ALTER TABLE "material_legacy" RENAME CONSTRAINT "PK_0343d0d577f3effc2054cbaca7f" TO "PK_material_legacy";
          ALTER TABLE "material_legacy" RENAME CONSTRAINT "FK_d03087a05d494fa76fb9e10892f" TO "FK_material_legacy_thumbnail";
        END IF;
        IF to_regclass('public.material_color') IS NOT NULL THEN
          ALTER TABLE "material_color" RENAME TO "material_color_legacy";
          ALTER TABLE "material_color_legacy" RENAME CONSTRAINT "PK_c6d9ec87b44804a21510f110a88" TO "PK_material_color_legacy";
          ALTER TABLE "material_color_legacy" RENAME CONSTRAINT "FK_46cfb18f856e47e789bf9a33981" TO "FK_material_color_legacy_material";
          ALTER TABLE "material_color_legacy" RENAME CONSTRAINT "FK_b6488e2cd11d35741d9e693f6ce" TO "FK_material_color_legacy_asset";
        END IF;
      END $$;`
    );
    await queryRunner.query(
      `CREATE TABLE "material" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "slug" character varying NOT NULL, "label" character varying NOT NULL, "subtitle" character varying, "description" character varying, "id" SERIAL NOT NULL, "thumbnailAssetId" integer, CONSTRAINT "UQ_2e27d9ae5bd024f12fd35af717a" UNIQUE ("slug"), CONSTRAINT "PK_0343d0d577f3effc2054cbaca7f" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "material_color" ("colorId" character varying NOT NULL, "label" character varying NOT NULL, "hex" character varying, "materialId" integer NOT NULL, "position" integer NOT NULL, "assetId" integer, CONSTRAINT "PK_c6d9ec87b44804a21510f110a88" PRIMARY KEY ("colorId", "materialId"))`
    );
    await queryRunner.query(
      `ALTER TABLE "material" ADD CONSTRAINT "FK_d03087a05d494fa76fb9e10892f" FOREIGN KEY ("thumbnailAssetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD CONSTRAINT "FK_b6488e2cd11d35741d9e693f6ce" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD CONSTRAINT "FK_46cfb18f856e47e789bf9a33981" FOREIGN KEY ("materialId") REFERENCES "material"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF to_regclass('public.material_legacy') IS NOT NULL THEN
          INSERT INTO "material" ("slug", "label", "subtitle", "description", "thumbnailAssetId")
            SELECT "id", "label", "subtitle", "description", "thumbnailAssetId"
            FROM "material_legacy" ORDER BY "id";

          IF to_regclass('public.material_color_legacy') IS NOT NULL THEN
            INSERT INTO "material_color" ("colorId", "label", "hex", "assetId", "materialId", "position")
              SELECT c."colorId", c."label", c."hex", c."assetId", m."id", c."position"
              FROM "material_color_legacy" c
              JOIN "material_legacy" o ON o."id" = c."materialId"
              JOIN "material" m ON m."slug" = o."id";
          END IF;

          IF EXISTS (SELECT 1 FROM "material") THEN
            PERFORM setval(pg_get_serial_sequence('"material"', 'id'), (SELECT MAX("id") FROM "material"), true);
          END IF;

          DROP TABLE "material_color_legacy";
          DROP TABLE "material_legacy";
        END IF;
      END $$;`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "material_color" DROP CONSTRAINT "FK_46cfb18f856e47e789bf9a33981"`);
    await queryRunner.query(`ALTER TABLE "material_color" DROP CONSTRAINT "FK_b6488e2cd11d35741d9e693f6ce"`);
    await queryRunner.query(`ALTER TABLE "material" DROP CONSTRAINT "FK_d03087a05d494fa76fb9e10892f"`);
    await queryRunner.query(`DROP TABLE "material_color"`);
    await queryRunner.query(`DROP TABLE "material"`);
  }
}
