import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTranslationDriftDismissal1795266761390 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "translation_drift_dismissal" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "entityType" character varying NOT NULL, "entityKey" character varying NOT NULL, "field" character varying NOT NULL, "languageCode" character varying NOT NULL, "auditEntryId" integer NOT NULL, "actorIdentifier" character varying, "id" SERIAL NOT NULL, CONSTRAINT "UQ_cda7a45e5c98a4a542d8cea7731" UNIQUE ("entityType", "entityKey", "field", "languageCode"), CONSTRAINT "PK_118a69abdd6ded9810f05b0721c" PRIMARY KEY ("id"))`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "translation_drift_dismissal"`, undefined);
  }
}
