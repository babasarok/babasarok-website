import { MigrationInterface, QueryRunner } from "typeorm";

export class ShippingMethodRequiresAddress1793695771876 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "shipping_method" ADD "customFieldsRequiresaddress" boolean DEFAULT false`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "shipping_method" DROP COLUMN "customFieldsRequiresaddress"`,
      undefined
    );
  }
}
