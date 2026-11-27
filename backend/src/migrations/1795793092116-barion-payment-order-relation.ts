import { MigrationInterface, QueryRunner } from "typeorm";

export class BarionPaymentOrderRelation1795793092116 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "barion_payment" ADD CONSTRAINT "FK_0b4e750e0473f03071d3e96de8b" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "barion_payment" DROP CONSTRAINT "FK_0b4e750e0473f03071d3e96de8b"`
    );
  }
}
