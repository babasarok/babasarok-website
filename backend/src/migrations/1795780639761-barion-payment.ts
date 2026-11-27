import { MigrationInterface, QueryRunner } from "typeorm";

export class BarionPayment1795780639761 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "barion_payment" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "paymentId" character varying NOT NULL, "orderId" integer NOT NULL, "orderCode" character varying NOT NULL, "sessionId" character varying NOT NULL, "status" character varying NOT NULL, "role" character varying NOT NULL, "amount" integer NOT NULL, "currencyCode" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_cd8316903e051efa4371150e1bb" PRIMARY KEY ("id"))`,
      undefined
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_971b347929a2251a33c98ac7be" ON "barion_payment" ("paymentId") `,
      undefined
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0b4e750e0473f03071d3e96de8" ON "barion_payment" ("orderId") `,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP INDEX "public"."IDX_0b4e750e0473f03071d3e96de8"`, undefined);
    await queryRunner.query(`DROP INDEX "public"."IDX_971b347929a2251a33c98ac7be"`, undefined);
    await queryRunner.query(`DROP TABLE "barion_payment"`, undefined);
  }
}
