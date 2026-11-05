import { MigrationInterface, QueryRunner } from "typeorm";

export class DropProductDefinitionLabel1793616627842 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `UPDATE "product_definition" SET "definition" = "definition" - 'label'`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `UPDATE "product_definition" pd
       SET "definition" = jsonb_set(pd."definition", '{label}', to_jsonb(pt.name))
       FROM "product" p
       JOIN "product_translation" pt ON pt."baseId" = p.id AND pt."languageCode" = 'hu'
       WHERE pd."nativeProductId" = p.id`,
      undefined
    );
  }
}
