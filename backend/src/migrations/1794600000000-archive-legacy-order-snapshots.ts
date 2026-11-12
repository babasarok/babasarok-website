import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The pre-cutover quote-order flow wrote its prices and line details only
 * into custom fields: its variants are 0-priced placeholders, so the native
 * order columns hold nothing. This migration moves that snapshot data into
 * one private order note (dashboard-only: the shop API serves public history
 * entries only) for every order the removed legacy flow placed, then drops
 * the now-empty columns:
 *
 * - order: deliveryMethodName, deliveryPrice, deliveryFree, orderTotal,
 *   setDiscountSummary
 * - order_line: title, detailsJson, quotedUnitPrice, quotedLineTotal
 *
 * A legacy order always carries a deliveryPrice and an orderTotal (both
 * required by the removed flow's input), and nothing else writes those
 * columns, so their presence selects exactly the legacy orders.
 *
 * Idempotent: the note block returns early once the deliveryPrice column is
 * gone, and the drops are IF EXISTS, so a re-run changes nothing.
 */
export const ARCHIVE_LEGACY_SNAPSHOT_STATEMENTS: readonly string[] = [
  `DO $archive$
   DECLARE
     o RECORD;
     l RECORD;
     d RECORD;
     note TEXT;
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'order' AND column_name = 'customFieldsDeliveryprice'
     ) THEN
       RETURN;
     END IF;

     FOR o IN
       SELECT id,
              "customFieldsDeliverymethodname" AS method_name,
              "customFieldsDeliveryprice" AS delivery_price,
              "customFieldsDeliveryfree" AS delivery_free,
              "customFieldsOrdertotal" AS order_total,
              "customFieldsSetdiscountsummary" AS set_summary
       FROM "order"
       WHERE "customFieldsDeliveryprice" IS NOT NULL
          OR "customFieldsOrdertotal" IS NOT NULL
     LOOP
       note := 'A cutover (2026-11-07) előtti ajánlatos rendelés adatai a törölt egyéni mezőkből:'
            || chr(10) || 'Szállítási mód: ' || COALESCE(o.method_name, '—')
            || chr(10) || 'Összesen: ' || COALESCE(o.order_total::text, '—') || ' Ft'
            || chr(10) || 'Szállítási díj: '
            || CASE
                 WHEN o.delivery_free THEN 'ingyenes'
                 ELSE COALESCE(o.delivery_price::text, '—') || ' Ft'
               END
            || chr(10) || 'Szett-kedvezmény: ' || COALESCE(o.set_summary, '—');

       FOR l IN
         SELECT "quantity",
                "customFieldsTitle" AS title,
                "customFieldsQuotedunitprice" AS unit_price,
                "customFieldsQuotedlinetotal" AS line_total,
                "customFieldsDetailsjson" AS details
         FROM order_line
         WHERE "orderId" = o.id
         ORDER BY id
       LOOP
         note := note || chr(10) || chr(10)
              || l."quantity"::text || ' × ' || COALESCE(l.title, '—')
              || ' — egységár ' || COALESCE(l.unit_price::text, '—')
              || ' Ft, összesen ' || COALESCE(l.line_total::text, '—') || ' Ft';

         IF l.details IS NOT NULL AND btrim(l.details) <> '' THEN
           BEGIN
             FOR d IN
               SELECT j->>'label' AS label, j->>'value' AS value,
                      COALESCE((j->>'depth')::int, 0) AS depth
               FROM jsonb_array_elements(l.details::jsonb) j
             LOOP
               note := note || chr(10) || repeat('  ', d.depth) || d.label || ': ' || d.value;
             END LOOP;
           EXCEPTION
             WHEN OTHERS THEN
               note := note || chr(10) || 'Részletek (nyers): ' || l.details;
           END;
         END IF;
       END LOOP;

       INSERT INTO history_entry
         ("createdAt", "updatedAt", "type", "isPublic", "data", "discriminator", "orderId")
       VALUES
         (now(), now(), 'ORDER_NOTE', false,
          jsonb_build_object('note', note)::text, 'OrderHistoryEntry', o.id);
     END LOOP;
   END
   $archive$;`,

  `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsDeliverymethodname"`,
  `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsDeliveryprice"`,
  `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsDeliveryfree"`,
  `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsOrdertotal"`,
  `ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsSetdiscountsummary"`,
  `ALTER TABLE "order_line" DROP COLUMN IF EXISTS "customFieldsTitle"`,
  `ALTER TABLE "order_line" DROP COLUMN IF EXISTS "customFieldsDetailsjson"`,
  `ALTER TABLE "order_line" DROP COLUMN IF EXISTS "customFieldsQuotedunitprice"`,
  `ALTER TABLE "order_line" DROP COLUMN IF EXISTS "customFieldsQuotedlinetotal"`,
];

export class ArchiveLegacyOrderSnapshots1794600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    for (const statement of ARCHIVE_LEGACY_SNAPSHOT_STATEMENTS) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    // Not restorable from the database alone: the snapshots now live inside
    // the notes' free text. Restore from a backup instead.
    await queryRunner.query(
      `DO $$ BEGIN RAISE EXCEPTION 'the legacy-snapshot archive migration is not reversible'; END $$;`,
      undefined
    );
  }
}
