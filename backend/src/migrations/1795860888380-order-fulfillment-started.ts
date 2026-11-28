import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The fulfillment-started boundary (ADR 0021 §4): when the owner begins
 * making the product (her definition spans production and shipping —
 * made-to-order throughout). The refund-policy check reads this flag.
 */
export class OrderFulfillmentStarted1795860888380 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "order" ADD "customFieldsFulfillmentstartedat" TIMESTAMP(6)`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "order" DROP COLUMN "customFieldsFulfillmentstartedat"`,
      undefined
    );
  }
}
