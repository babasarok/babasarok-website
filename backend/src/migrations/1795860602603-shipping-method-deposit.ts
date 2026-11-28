import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The payment arrangement lives on the delivery variant (ADR 0021 §1):
 * `customFieldsDeposit` — 0 = full prepay, > 0 = the deposit collected at
 * placement, the remainder at handover. The `gls-utanvet` variant carries
 * the 6 000 Ft deposit (backfilled here once; the owner's dashboard edits
 * keep it afterwards).
 */
export class ShippingMethodDeposit1795860602603 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "shipping_method" ADD "customFieldsDeposit" integer DEFAULT '0'`,
      undefined
    );
    await queryRunner.query(
      `UPDATE "shipping_method" SET "customFieldsDeposit" = 6000 WHERE "code" = 'gls-utanvet' AND "deletedAt" IS NULL`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "shipping_method" DROP COLUMN "customFieldsDeposit"`,
      undefined
    );
  }
}
