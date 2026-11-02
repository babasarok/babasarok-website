import type { MigrationInterface, QueryRunner } from "typeorm";

export class MaterialTranslations1793617493281 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "material_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "label" character varying NOT NULL, "subtitle" character varying NOT NULL DEFAULT '', "description" character varying NOT NULL DEFAULT '', "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "UQ_2c3f6a8f2130f5778a8fbafcff9" UNIQUE ("languageCode", "baseId"), CONSTRAINT "PK_ad50492371d7035085bbc531f43" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_820741206ba1e7e26296f4455c" ON "material_translation" ("baseId")`
    );
    await queryRunner.query(
      `CREATE TABLE "material_color_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "label" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "UQ_3e4ad11e65d558078b85f0e3a63" UNIQUE ("languageCode", "baseId"), CONSTRAINT "PK_c57bc98bfd8f21afc97fe390f89" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4f00607eb25747673a91fe1e91" ON "material_color_translation" ("baseId")`
    );

    await queryRunner.query(
      `INSERT INTO "material_translation" ("languageCode", "label", "subtitle", "description", "baseId")
       SELECT 'hu', "label", COALESCE("subtitle", ''), COALESCE("description", ''), "id" FROM "material"`
    );
    await queryRunner.query(`ALTER TABLE "material" DROP COLUMN "label"`);
    await queryRunner.query(`ALTER TABLE "material" DROP COLUMN "subtitle"`);
    await queryRunner.query(`ALTER TABLE "material" DROP COLUMN "description"`);

    await queryRunner.query(
      `ALTER TABLE "material_color" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`
    );
    await queryRunner.query(`ALTER TABLE "material_color" ADD "id" SERIAL NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "material_color" DROP CONSTRAINT "PK_c6d9ec87b44804a21510f110a88"`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD CONSTRAINT "PK_c09f4ba1575402b6c418d69776a" PRIMARY KEY ("id")`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD CONSTRAINT "UQ_c6d9ec87b44804a21510f110a88" UNIQUE ("materialId", "colorId")`
    );
    await queryRunner.query(
      `INSERT INTO "material_color_translation" ("languageCode", "label", "baseId")
       SELECT 'hu', "label", "id" FROM "material_color"`
    );
    await queryRunner.query(`ALTER TABLE "material_color" DROP COLUMN "label"`);

    await queryRunner.query(
      `ALTER TABLE "material_translation" ADD CONSTRAINT "FK_820741206ba1e7e26296f4455c6" FOREIGN KEY ("baseId") REFERENCES "material"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color_translation" ADD CONSTRAINT "FK_4f00607eb25747673a91fe1e911" FOREIGN KEY ("baseId") REFERENCES "material_color"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "material_color_translation" DROP CONSTRAINT "FK_4f00607eb25747673a91fe1e911"`
    );
    await queryRunner.query(
      `ALTER TABLE "material_translation" DROP CONSTRAINT "FK_820741206ba1e7e26296f4455c6"`
    );

    await queryRunner.query(`ALTER TABLE "material_color" ADD "label" character varying`);
    await queryRunner.query(
      `UPDATE "material_color" c SET "label" = COALESCE(
         (SELECT t."label" FROM "material_color_translation" t WHERE t."baseId" = c."id" AND t."languageCode" = 'hu'),
         (SELECT t."label" FROM "material_color_translation" t WHERE t."baseId" = c."id" ORDER BY t."id" LIMIT 1),
         c."colorId")`
    );
    await queryRunner.query(`ALTER TABLE "material_color" ALTER COLUMN "label" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "material_color" DROP CONSTRAINT "UQ_c6d9ec87b44804a21510f110a88"`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" DROP CONSTRAINT "PK_c09f4ba1575402b6c418d69776a"`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD CONSTRAINT "PK_c6d9ec87b44804a21510f110a88" PRIMARY KEY ("colorId", "materialId")`
    );
    await queryRunner.query(`ALTER TABLE "material_color" DROP COLUMN "id"`);
    await queryRunner.query(`ALTER TABLE "material_color" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "material_color" DROP COLUMN "createdAt"`);

    await queryRunner.query(`ALTER TABLE "material" ADD "description" character varying`);
    await queryRunner.query(`ALTER TABLE "material" ADD "subtitle" character varying`);
    await queryRunner.query(`ALTER TABLE "material" ADD "label" character varying`);
    await queryRunner.query(
      `UPDATE "material" m SET
         "label" = COALESCE(
           (SELECT t."label" FROM "material_translation" t WHERE t."baseId" = m."id" AND t."languageCode" = 'hu'),
           (SELECT t."label" FROM "material_translation" t WHERE t."baseId" = m."id" ORDER BY t."id" LIMIT 1),
           m."slug"),
         "subtitle" = NULLIF((SELECT t."subtitle" FROM "material_translation" t WHERE t."baseId" = m."id" AND t."languageCode" = 'hu'), ''),
         "description" = NULLIF((SELECT t."description" FROM "material_translation" t WHERE t."baseId" = m."id" AND t."languageCode" = 'hu'), '')`
    );
    await queryRunner.query(`ALTER TABLE "material" ALTER COLUMN "label" SET NOT NULL`);

    await queryRunner.query(`DROP INDEX "public"."IDX_4f00607eb25747673a91fe1e91"`);
    await queryRunner.query(`DROP TABLE "material_color_translation"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_820741206ba1e7e26296f4455c"`);
    await queryRunner.query(`DROP TABLE "material_translation"`);
  }
}
