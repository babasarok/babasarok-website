import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMaterialContentFields1793534195158 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "material" ADD "subtitle" character varying`, undefined);
    await queryRunner.query(
      `ALTER TABLE "material" ADD "description" character varying`,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "material" ADD "thumbnailAssetId" integer`, undefined);
    await queryRunner.query(
      `ALTER TABLE "material" ADD CONSTRAINT "FK_d03087a05d494fa76fb9e10892f" FOREIGN KEY ("thumbnailAssetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      undefined
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `ALTER TABLE "material" DROP CONSTRAINT "FK_d03087a05d494fa76fb9e10892f"`,
      undefined
    );
    await queryRunner.query(`ALTER TABLE "material" DROP COLUMN "thumbnailAssetId"`, undefined);
    await queryRunner.query(`ALTER TABLE "material" DROP COLUMN "description"`, undefined);
    await queryRunner.query(`ALTER TABLE "material" DROP COLUMN "subtitle"`, undefined);
  }
}
