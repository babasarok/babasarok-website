import { MigrationInterface, QueryRunner } from "typeorm";

export class GlsStatusNotified1795255909578 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "scheduled_task_record" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "taskId" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "lockedAt" TIMESTAMP(3), "lastExecutedAt" TIMESTAMP(3), "manuallyTriggeredAt" TIMESTAMP(3), "lastResult" json, "id" SERIAL NOT NULL, CONSTRAINT "UQ_661876d97056cad9fd37eaa8774" UNIQUE ("taskId"), CONSTRAINT "PK_efd4b61a3b227f3eba94de32e4c" PRIMARY KEY ("id"))`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "gls_parcel" ADD "problemNotifiedCode" character varying`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "gls_parcel" ADD "problemNotifiedAt" TIMESTAMP`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "gls_parcel" DROP COLUMN "problemNotifiedAt"`, undefined);
    await queryRunner.query(
      `ALTER TABLE "gls_parcel" DROP COLUMN "problemNotifiedCode"`,
      undefined
    );
    await queryRunner.query(`DROP TABLE "scheduled_task_record"`, undefined);
  }
}
