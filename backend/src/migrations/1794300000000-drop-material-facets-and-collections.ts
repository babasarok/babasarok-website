import { MigrationInterface, QueryRunner } from "typeorm";

export class DropMaterialFacetsAndCollections1794300000000 implements MigrationInterface {
  // ADR 0016 step 4: the sync-owned Material/Color facets and the
  // auto-managed per-material collections had no consumer and are gone with
  // their code. Idempotent: a re-run finds nothing to delete.
  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`
      CREATE TEMP TABLE adr0016_facet ON COMMIT DROP AS
      SELECT id FROM facet WHERE code IN ('babasarok-material', 'babasarok-color')
    `);
    await queryRunner.query(`
      CREATE TEMP TABLE adr0016_facet_value ON COMMIT DROP AS
      SELECT id FROM facet_value WHERE "facetId" IN (SELECT id FROM adr0016_facet)
    `);
    await queryRunner.query(`
      CREATE TEMP TABLE adr0016_collection ON COMMIT DROP AS
      SELECT DISTINCT c.id FROM collection c
      JOIN collection_translation t ON t."baseId" = c.id
      WHERE NOT c."isPrivate"
        AND t.slug LIKE 'material-%'
        AND c.filters LIKE '%facet-value-filter%'
    `);
    await queryRunner.query(`
      CREATE TEMP TABLE adr0016_collection_slug ON COMMIT DROP AS
      SELECT DISTINCT slug FROM collection_translation
      WHERE "baseId" IN (SELECT id FROM adr0016_collection)
    `);

    await queryRunner.query(`
      UPDATE search_index_item SET
        "facetIds" = array_to_string(ARRAY(
          SELECT x FROM unnest(string_to_array("facetIds", ',')) x
          WHERE x NOT IN (SELECT id::text FROM adr0016_facet)
        ), ','),
        "facetValueIds" = array_to_string(ARRAY(
          SELECT x FROM unnest(string_to_array("facetValueIds", ',')) x
          WHERE x NOT IN (SELECT id::text FROM adr0016_facet_value)
        ), ','),
        "collectionIds" = array_to_string(ARRAY(
          SELECT x FROM unnest(string_to_array("collectionIds", ',')) x
          WHERE x NOT IN (SELECT id::text FROM adr0016_collection)
        ), ','),
        "collectionSlugs" = array_to_string(ARRAY(
          SELECT x FROM unnest(string_to_array("collectionSlugs", ',')) x
          WHERE x NOT IN (SELECT slug FROM adr0016_collection_slug)
        ), ',')
    `);

    await queryRunner.query(`
      DELETE FROM product_variant_facet_values_facet_value
      WHERE "facetValueId" IN (SELECT id FROM adr0016_facet_value)
    `);
    await queryRunner.query(`
      DELETE FROM product_facet_values_facet_value
      WHERE "facetValueId" IN (SELECT id FROM adr0016_facet_value)
    `);
    await queryRunner.query(
      `DELETE FROM collection WHERE id IN (SELECT id FROM adr0016_collection)`
    );
    await queryRunner.query(
      `DELETE FROM facet_value WHERE id IN (SELECT id FROM adr0016_facet_value)`
    );
    await queryRunner.query(`DELETE FROM facet WHERE id IN (SELECT id FROM adr0016_facet)`);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `DO $$ BEGIN RAISE EXCEPTION 'ADR 0016 facet and collection removal is not reversible'; END $$;`,
      undefined
    );
  }
}
