import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFacetValueThreadColorFields1793617248615 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "facet_value" ADD "customFieldsHex" character varying(255)`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "facet_value" ADD "customFieldsSwatchid" integer`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "facet_value" ADD CONSTRAINT "FK_3c73cb09f7c7645094a72ebcc41" FOREIGN KEY ("customFieldsSwatchid") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "facet_value" DROP CONSTRAINT "FK_3c73cb09f7c7645094a72ebcc41"`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "facet_value" DROP COLUMN "customFieldsSwatchid"`,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "facet_value" DROP COLUMN "customFieldsHex"`, undefined);
  }
}
