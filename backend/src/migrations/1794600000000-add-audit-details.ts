import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditDetails1794600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "audit_log_entry" ADD "details" jsonb`, undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "audit_log_entry" DROP COLUMN "details"`, undefined);
  }
}
