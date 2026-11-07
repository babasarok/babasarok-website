import { MigrationInterface, QueryRunner } from "typeorm";

export class DropProductDefinitionFlags1793700000000 implements MigrationInterface {
  // Owner decision 2026-11: one switch governs visibility and orderability —
  // the native product's "enabled". The shop API hard-filters disabled
  // products (not listed, not configurable), so the definition carries neither
  // a hidden flag nor a separate orderable flag. The strict definition schema
  // no longer accepts the keys, so leaving them behind would fail every parse.
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `UPDATE "product_definition"
       SET "definition" = "definition" - 'hiddenInProductList' - 'orderable'`,
      undefined
    );
  }

  // Restores the flags only for rows that can still carry them: disabled
  // products read as hidden and non-orderable, enabled ones as listed and
  // orderable.
  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `UPDATE "product_definition" pd
       SET "definition" = jsonb_set(
         jsonb_set(pd."definition", '{orderable}', to_jsonb(p."enabled")),
         '{hiddenInProductList}',
         to_jsonb(p."enabled" = false)
       )
       FROM "product" p
       WHERE p."id" = pd."nativeProductId"`,
      undefined
    );
  }
}
