import {MigrationInterface, QueryRunner} from "typeorm";

export class AddProductionTimeSettings1795769339222 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsProductiondays" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsConfiguratorproductiondays" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsReadymadeproductiondays" integer`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsReadymadeproductiondays"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsConfiguratorproductiondays"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsProductiondays"`, undefined);
   }

}
