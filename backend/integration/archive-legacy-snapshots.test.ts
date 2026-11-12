/**
 * Seam: the legacy-snapshot archive migration vs. orders placed by the
 * removed quote-order flow. Their prices and line details live only in
 * custom-field columns (their variants are 0-priced placeholders), so the
 * migration packs them into one private order note before dropping the
 * columns, and a re-run changes nothing.
 *
 * The harness migrates at boot, so the columns are already gone by test
 * time: the test re-creates the pre-migration column shapes, marks a
 * freshly placed order legacy, and asserts the note through the admin API
 * (which also proves the history row hydrates as an OrderHistoryEntry).
 * Against the pre-change schema both the note assertion and the
 * columns-gone assertion fail, so the test can go red.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { env } from "../dist/env";
import { ARCHIVE_LEGACY_SNAPSHOT_STATEMENTS } from "../dist/migrations/1794600000000-archive-legacy-order-snapshots";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { takaro } from "./lines";
import { addLine, completeCheckout, newShopper, transitionTo } from "./shop";

const ORDER_QUERY = `
  query($code: String!) {
    orders(options: { filter: { code: { eq: $code } } }) { items {
      code state createdAt updatedAt
      subTotalWithTax shippingWithTax totalWithTax
      lines {
        id quantity unitPriceWithTax linePriceWithTax
        productVariant { id name sku product { id name } }
        customFields { configText lengthCm selections }
      }
    } }
  }
`;

const HISTORY_QUERY = `
  query($code: String!) {
    orders(options: { filter: { code: { eq: $code } } }) { items {
      history { items { type isPublic data } }
    } }
  }
`;

const DETAILS_JSON = JSON.stringify([
  { label: "Anyag", value: "Pamut", depth: 0 },
  { label: "Szín", value: "Kék", depth: 1 },
]);

const LEGACY_ORDER_VALUES = ["GLS házhozszállítás", 2500, false, 12_500, "Ovis szett: -2000 Ft"];
const LEGACY_LINE_VALUES = ["[placeholder] Int takaró", 10_500, 10_500, DETAILS_JSON];

let server: IntegrationServer;
let pool: Pool;
let legacyOrderCode: string;
let nativeOrderCode: string;

async function recreateLegacyColumns(): Promise<void> {
  await pool.query(`
    ALTER TABLE "order"
      ADD COLUMN "customFieldsDeliveryprice" integer,
      ADD COLUMN "customFieldsDeliveryfree" boolean,
      ADD COLUMN "customFieldsOrdertotal" integer,
      ADD COLUMN "customFieldsSetdiscountsummary" text
  `);
  await pool.query(`
    ALTER TABLE "order_line"
      ADD COLUMN "customFieldsTitle" character varying(255),
      ADD COLUMN "customFieldsDetailsjson" text,
      ADD COLUMN "customFieldsQuotedunitprice" integer,
      ADD COLUMN "customFieldsQuotedlinetotal" integer
  `);
}

async function markLegacy(code: string): Promise<void> {
  await pool.query(
    `UPDATE "order"
     SET "customFieldsDeliverymethodname" = $1,
         "customFieldsDeliveryprice" = $2,
         "customFieldsDeliveryfree" = $3,
         "customFieldsOrdertotal" = $4,
         "customFieldsSetdiscountsummary" = $5
     WHERE code = $6`,
    [...LEGACY_ORDER_VALUES, code]
  );
  await pool.query(
    `UPDATE order_line
     SET "customFieldsTitle" = $1,
         "customFieldsQuotedunitprice" = $2,
         "customFieldsQuotedlinetotal" = $3,
         "customFieldsDetailsjson" = $4
     WHERE "orderId" = (SELECT id FROM "order" WHERE code = $5)`,
    [...LEGACY_LINE_VALUES, code]
  );
}

const OrderSchema = z.object({
  code: z.string(),
  lines: z.array(z.unknown()),
});

type LoadedOrder = z.infer<typeof OrderSchema>;

async function order(code: string): Promise<LoadedOrder> {
  const { orders } = await run(
    server.admin,
    ORDER_QUERY,
    { code },
    z.object({
      orders: z.object({ items: z.array(z.unknown()).length(1) }),
    })
  );

  return OrderSchema.parse(orders.items[0]);
}

const HistorySchema = z.object({
  history: z.object({
    items: z.array(z.object({ type: z.string(), isPublic: z.boolean(), data: z.unknown() })),
  }),
});

async function notesOf(
  code: string
): Promise<Array<{ isPublic: boolean; data: { note: string } }>> {
  const { orders } = await run(
    server.admin,
    HISTORY_QUERY,
    { code },
    z.object({
      orders: z.object({ items: z.array(z.unknown()).length(1) }),
    })
  );

  return HistorySchema.parse(orders.items[0])
    .history.items.filter((entry) => entry.type === "ORDER_NOTE")
    .map((entry) => ({ isPublic: entry.isPublic, data: entry.data as { note: string } }));
}

async function runMigration(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const statement of ARCHIVE_LEGACY_SNAPSHOT_STATEMENTS) {
      await client.query(statement);
    }

    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

async function placeOrder(): Promise<string> {
  const buyer = newShopper(server);

  await addLine(buyer, takaro({ material: "int-pamut" }));
  await completeCheckout(buyer);

  const placed = await transitionTo(buyer, "ArrangingPayment");

  if (!("order" in placed)) {
    throw new Error(`placing the order was refused: ${JSON.stringify(placed.refusal)}`);
  }

  return placed.order.code;
}

async function columnsDropped(): Promise<boolean> {
  const result = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns
     WHERE (table_name = 'order' AND column_name IN ('customFieldsDeliveryprice', 'customFieldsDeliveryfree', 'customFieldsOrdertotal', 'customFieldsSetdiscountsummary'))
        OR (table_name = 'order_line' AND column_name IN ('customFieldsTitle', 'customFieldsDetailsjson', 'customFieldsQuotedunitprice', 'customFieldsQuotedlinetotal'))`
  );

  return (result.rows[0] as { n: number }).n === 0;
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
  pool = new Pool({ connectionString: env.databaseUrl, max: 1 });

  legacyOrderCode = await placeOrder();
  nativeOrderCode = await placeOrder();
  await recreateLegacyColumns();
  await markLegacy(legacyOrderCode);
});

afterAll(async () => {
  await server.stop();
  await pool.end();
});

describe("the legacy-snapshot archive migration", () => {
  it("archives the legacy order's snapshot into one private note and drops the columns", async () => {
    const before = await order(legacyOrderCode);
    expect(await notesOf(legacyOrderCode)).toEqual([]);
    expect(await columnsDropped()).toBe(false);

    await runMigration();

    const notes = await notesOf(legacyOrderCode);

    expect(notes).toHaveLength(1);
    expect(notes[0]?.isPublic).toBe(false);
    expect(notes[0]?.data.note).toContain("Összesen: 12500 Ft");
    expect(notes[0]?.data.note).toContain("Szállítási díj: 2500 Ft");
    expect(notes[0]?.data.note).toContain("Szett-kedvezmény: Ovis szett: -2000 Ft");
    expect(notes[0]?.data.note).toContain(
      "1 × [placeholder] Int takaró — egységár 10500 Ft, összesen 10500 Ft"
    );
    expect(notes[0]?.data.note).toContain("Anyag: Pamut");
    expect(notes[0]?.data.note).toContain("  Szín: Kék");

    expect(await order(legacyOrderCode)).toEqual(before);
    expect(await columnsDropped()).toBe(true);
  });

  it("leaves native orders untouched", async () => {
    expect(await notesOf(nativeOrderCode)).toEqual([]);
  });

  it("is idempotent", async () => {
    const before = await order(legacyOrderCode);

    await runMigration();

    expect(await order(legacyOrderCode)).toEqual(before);
    expect(await notesOf(legacyOrderCode)).toHaveLength(1);
  });
});
