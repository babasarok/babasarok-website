import {MigrationInterface, QueryRunner} from "typeorm";

export class AddOrderTaxNumber1794398619502 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsTaxnumber" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsTaxnumber"`, undefined);
   }

}
