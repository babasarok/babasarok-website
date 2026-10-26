import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChannelEmailFields1792972252013 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channel" ADD "customFieldsOrderemailfrom" character varying(255)`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "channel" ADD "customFieldsShopowneremail" character varying(255)`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "channel" DROP COLUMN "customFieldsShopowneremail"`,
      undefined
    );
    await queryRunner.query(
      `ALTER TABLE "channel" DROP COLUMN "customFieldsOrderemailfrom"`,
      undefined
    );
  }
}
