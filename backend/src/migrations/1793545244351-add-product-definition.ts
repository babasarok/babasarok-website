import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductDefinition1793545244351 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "product_definition" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productId" character varying NOT NULL, "definition" jsonb NOT NULL, "nativeProductId" integer, "syncedDefinitionHash" character varying, "syncedNativeStateHash" character varying, "id" SERIAL NOT NULL, CONSTRAINT "UQ_0fc0976b6fdd91242c86524b4c6" UNIQUE ("productId"), CONSTRAINT "PK_c2737bc9cc6c1dcb310cf97be2e" PRIMARY KEY ("id"))`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "product_definition"`, undefined);
  }
}
