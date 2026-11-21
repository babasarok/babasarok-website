import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * GLS labels (ADR 0020): the private parcel table holding each GLS parcel's
 * ids, environment and label PDF, the channel's GLS sender address, and the
 * two GLS delivery methods switched from manual fulfillment to the `gls`
 * handler (the seed only creates missing methods, so existing rows need it).
 */
export class GlsLabels1795128204743 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "gls_parcel" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "orderId" integer NOT NULL, "parcelId" integer NOT NULL, "parcelNumber" character varying NOT NULL, "mode" character varying NOT NULL, "labelPdf" bytea, "deletedInGlsAt" TIMESTAMP, "id" SERIAL NOT NULL, CONSTRAINT "PK_7d6ca9ae237b8985dd87420589a" PRIMARY KEY ("id"))`,
      undefined
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb1dbaf997f0be393581db35eb" ON "gls_parcel" ("orderId") `,
      undefined
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a5a311dd07e83c713f5a631bac" ON "gls_parcel" ("parcelNumber") `,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsGlssender" jsonb`, undefined);
    await queryRunner.query(
      `UPDATE "shipping_method" SET "fulfillmentHandlerCode" = 'gls' WHERE "code" IN ('gls-elore-utalas', 'gls-utanvet') AND "fulfillmentHandlerCode" = 'manual-fulfillment'`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `UPDATE "shipping_method" SET "fulfillmentHandlerCode" = 'manual-fulfillment' WHERE "code" IN ('gls-elore-utalas', 'gls-utanvet') AND "fulfillmentHandlerCode" = 'gls'`,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsGlssender"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_a5a311dd07e83c713f5a631bac"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_eb1dbaf997f0be393581db35eb"`, undefined);
    await queryRunner.query(`DROP TABLE "gls_parcel"`, undefined);
  }
}
