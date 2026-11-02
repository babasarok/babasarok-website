import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductPopularityRank1793638673312 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "product" ADD "customFieldsPopularityrank" integer`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN "customFieldsPopularityrank"`,
      undefined
    );
  }
}
