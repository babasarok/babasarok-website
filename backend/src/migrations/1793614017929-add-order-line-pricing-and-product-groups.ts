import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderLinePricingAndProductGroups1793614017929 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "product_group" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "groupId" character varying NOT NULL, "label" character varying NOT NULL, "kind" character varying NOT NULL, "discount" integer, "productIds" jsonb NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "UQ_6f185abddff13393102cd653c1c" UNIQUE ("groupId"), CONSTRAINT "PK_8c03e90007cd9645242e594a041" PRIMARY KEY ("id"))`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "order_line" ADD "customFieldsLengthcm" integer`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "order_line" ADD "customFieldsSelections" text`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "order_line" DROP COLUMN "customFieldsSelections"`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "order_line" DROP COLUMN "customFieldsLengthcm"`,
      undefined
    );
    await queryRunner.query(`DROP TABLE "product_group"`, undefined);
  }
}
