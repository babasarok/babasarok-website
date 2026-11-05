import { MigrationInterface, QueryRunner } from "typeorm";

export class DropProductDefinitionType1793617300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `UPDATE "product_definition" SET "definition" = "definition" - 'type'`,
      undefined
    );
  }

  // Restores `type` from the product's value in the babasarok-product-type
  // facet. Products without one stay without a type: the facet is the only
  // remaining record, and inventing a value would be wrong. Such rows fail the
  // old (strict, type-required) schema until an owner assigns the type.
  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `UPDATE "product_definition" pd
       SET "definition" = jsonb_set(pd."definition", '{type}', to_jsonb(fv."code"))
       FROM "product_facet_values_facet_value" pfv
       JOIN "facet_value" fv ON fv."id" = pfv."facetValueId"
       JOIN "facet" f ON f."id" = fv."facetId" AND f."code" = 'babasarok-product-type'
       WHERE pfv."productId" = pd."nativeProductId"`,
      undefined
    );
  }
}
