import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductDefinitionSyncState1793549263418 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    // Existing rows were synced inline before the sync moved to the job queue.
    await queryRunner.query(
      `ALTER TABLE "product_definition" ADD "syncState" character varying NOT NULL DEFAULT 'synced'`,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "product_definition" ADD "syncError" text`, undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "product_definition" DROP COLUMN "syncError"`, undefined);
    await queryRunner.query(`ALTER TABLE "product_definition" DROP COLUMN "syncState"`, undefined);
  }
}
