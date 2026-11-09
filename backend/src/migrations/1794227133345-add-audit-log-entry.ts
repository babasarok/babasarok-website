import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditLogEntry1794227133345 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "audit_log_entry" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "actorUserId" integer, "actorIdentifier" character varying, "entityType" character varying NOT NULL, "entityKey" character varying NOT NULL, "action" character varying NOT NULL, "summary" character varying, "source" character varying NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_905deda75b16075725a02ef38a0" PRIMARY KEY ("id"))`,
      undefined
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_574b2f6f888609bf6c7ecffcb3" ON "audit_log_entry" ("createdAt") `,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP INDEX "public"."IDX_574b2f6f888609bf6c7ecffcb3"`, undefined);
    await queryRunner.query(`DROP TABLE "audit_log_entry"`, undefined);
  }
}
