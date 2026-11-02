import {MigrationInterface, QueryRunner} from "typeorm";

export class AddCollectionSetDiscount1793615101310 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "collection" ADD "customFieldsSetdiscount" integer`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "collection" DROP COLUMN "customFieldsSetdiscount"`, undefined);
   }

}
