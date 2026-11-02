import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductDisplayFields1793613588868 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "product_translation" ADD "customFieldsShortdescription" text`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "product_translation" ADD "customFieldsTagline" character varying(255)`,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsDate" TIMESTAMP(6)`, undefined);
    await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsIconid" integer`, undefined);
    await queryRunner.query(
      `ALTER TABLE "asset_translation" ADD "customFieldsGallerydescription" text`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD CONSTRAINT "FK_7b133545923c28b1fd80751aaf3" FOREIGN KEY ("customFieldsIconid") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP CONSTRAINT "FK_7b133545923c28b1fd80751aaf3"`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "asset_translation" DROP COLUMN "customFieldsGallerydescription"`,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsIconid"`, undefined);
    await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsDate"`, undefined);
    await queryRunner.query(
      `ALTER TABLE "product_translation" DROP COLUMN "customFieldsTagline"`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "product_translation" DROP COLUMN "customFieldsShortdescription"`,
      undefined
    );
  }
}
