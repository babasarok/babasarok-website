import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderLinePricingAndProductGroups1793614017929 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
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
  }
}
