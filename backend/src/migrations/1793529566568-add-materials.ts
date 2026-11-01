import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddMaterials1793529566568 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "material" ("id" character varying NOT NULL, "label" character varying NOT NULL, CONSTRAINT "PK_0343d0d577f3effc2054cbaca7f" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "material_color" ("colorId" character varying NOT NULL, "label" character varying NOT NULL, "hex" character varying, "materialId" character varying NOT NULL, "position" integer NOT NULL, "assetId" integer, CONSTRAINT "PK_c6d9ec87b44804a21510f110a88" PRIMARY KEY ("colorId", "materialId"))`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD CONSTRAINT "FK_b6488e2cd11d35741d9e693f6ce" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" ADD CONSTRAINT "FK_46cfb18f856e47e789bf9a33981" FOREIGN KEY ("materialId") REFERENCES "material"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "material_color" DROP CONSTRAINT "FK_46cfb18f856e47e789bf9a33981"`
    );
    await queryRunner.query(
      `ALTER TABLE "material_color" DROP CONSTRAINT "FK_b6488e2cd11d35741d9e693f6ce"`
    );
    await queryRunner.query(`DROP TABLE "material_color"`);
    await queryRunner.query(`DROP TABLE "material"`);
  }
}
