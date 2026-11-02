import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderLineDetails1793000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "order_line" ADD "customFieldsDetailsjson" text`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "order_line" DROP COLUMN "customFieldsDetailsjson"`,
      undefined
    );
  }
}
