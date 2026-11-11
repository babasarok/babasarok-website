/**
 * Rehearsal of the ADR 0016 migrations on a copy of production (not a test
 * of this repo's code paths; skipped unless REHEARSAL_DATABASE_URL is set).
 * Runs the pending migrations against that database, then fails on any
 * active-order line or total that moved, on any active configured line the
 * definition would now price differently from its stored price, and on any
 * order the admin API cannot load. Prints the before/after report.
 *
 *   docker exec babasarok-website-postgres-1 psql -U babasarok -d postgres \
 *     -c "DROP DATABASE babasarok WITH (FORCE);" \
 *     -c "CREATE DATABASE babasarok TEMPLATE babasarok_prod_snapshot;"
 *   pnpm -C backend run build
 *   REHEARSAL_DATABASE_URL=postgres://babasarok:babasarok@localhost:5432/babasarok \
 *     pnpm -C backend exec vitest run --config vitest.integration.config.ts \
 *     integration/rehearse-one-variant.test.ts
 *
 * It boots the server against that database with a rehearsal-only superadmin
 * (created on boot) to load every order through the admin API.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { defaultConfig, mergeConfig, NoopLogger, runMigrations } from "@vendure/core";
import { createTestEnvironment } from "@vendure/testing";
import { config as appConfig } from "../dist/vendure-config";
import { computeLineUnitPrice, parseLineSelections } from "../dist/shared/pricing/index";
import { ProductDefinitionSchema } from "../dist/shared/product-definition/index";
import { run } from "./harness";

const url = process.env.REHEARSAL_DATABASE_URL;

const LineRow = z.object({
  code: z.string(),
  lineId: z.number(),
  productId: z.number(),
  listPrice: z.number(),
  quantity: z.number(),
  selections: z.string().nullable(),
  lengthCm: z.number().nullable(),
});

const OrderRow = z.object({
  code: z.string(),
  subTotal: z.number(),
  subTotalWithTax: z.number(),
  shipping: z.number(),
  shippingWithTax: z.number(),
});

const CountRow = z.object({ name: z.string(), n: z.number() });

const COUNTS = `
  select 'live variants' as name, count(*)::int as n from product_variant where "deletedAt" is null
  union all select 'soft-deleted variants', count(*)::int from product_variant where "deletedAt" is not null
  union all select 'variant translations', count(*)::int from product_variant_translation
  union all select 'variant prices', count(*)::int from product_variant_price
  union all select 'stock levels', count(*)::int from stock_level
  union all select 'variant channel rows', count(*)::int from product_variant_channels_channel
  union all select 'live option groups', count(*)::int from product_option_group where "deletedAt" is null
  union all select 'live options', count(*)::int from product_option where "deletedAt" is null
  union all select 'product-option-group links', count(*)::int from product_option_groups_product_option_group
  union all select 'variant-option links', count(*)::int from product_variant_options_product_option
  union all select 'facets', count(*)::int from facet
  union all select 'facet values', count(*)::int from facet_value
  union all select 'variant-facet-value links', count(*)::int from product_variant_facet_values_facet_value
  union all select 'collections', count(*)::int from collection
  union all select 'collection-variant links', count(*)::int from collection_product_variants_product_variant
  union all select 'search index rows', count(*)::int from search_index_item
  union all select 'order lines', count(*)::int from order_line
`;

const PlacedSchema = z.object({
  orders: z.object({ items: z.array(z.object({ id: z.string(), code: z.string() })) }),
});

const OrderLoadSchema = z.object({
  order: z.object({
    code: z.string(),
    state: z.string(),
    totalWithTax: z.number(),
    lines: z.array(
      z.object({
        unitPriceWithTax: z.number(),
        productVariant: z.object({ sku: z.string(), name: z.string() }),
      })
    ),
  }),
});

function assertLocal(databaseUrl: string): void {
  const { hostname, pathname } = new URL(databaseUrl);

  if (!["localhost", "127.0.0.1"].includes(hostname) || pathname === "/babasarok_prod_snapshot") {
    throw new Error("The rehearsal only runs against a local copy, never the snapshot itself.");
  }
}

async function snapshot(pool: Pool): Promise<{
  lines: Array<z.infer<typeof LineRow>>;
  orders: Array<z.infer<typeof OrderRow>>;
  counts: Map<string, number>;
}> {
  const lines = z.array(LineRow).parse(
    (
      await pool.query(`
        select o.code, ol.id as "lineId", v."productId" as "productId", ol."listPrice" as "listPrice",
          ol.quantity, ol."customFieldsSelections" as selections, ol."customFieldsLengthcm" as "lengthCm"
        from order_line ol
        join "order" o on o.id = ol."orderId"
        join product_variant v on v.id = ol."productVariantId"
        where o.active
        order by ol.id`)
    ).rows
  );
  const orders = z.array(OrderRow).parse(
    (
      await pool.query(`
        select code, "subTotal", "subTotalWithTax", shipping, "shippingWithTax"
        from "order" where active order by id`)
    ).rows
  );
  const counts = new Map(
    z
      .array(CountRow)
      .parse((await pool.query(COUNTS)).rows)
      .map((row) => [row.name, row.n])
  );

  return { lines, orders, counts };
}

const pool = url === undefined ? undefined : new Pool({ connectionString: url, max: 1 });

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(url === undefined || pool === undefined)("ADR 0016 rehearsal", () => {
  it("migrates without moving an active basket's prices and keeps every order loadable", async () => {
    if (url === undefined || pool === undefined) {
      return;
    }

    assertLocal(url);

    const config = mergeConfig(mergeConfig(defaultConfig, appConfig), {
      logger: new NoopLogger(),
      dbConnectionOptions: { url, logging: false },
      authOptions: {
        superadminCredentials: {
          identifier: "adr0016-rehearsal",
          password: "adr0016-rehearsal-only",
        },
      },
    });
    const before = await snapshot(pool);
    const started = performance.now();
    const applied = await runMigrations(config);
    const duration = Math.round(performance.now() - started);
    const after = await snapshot(pool);

    console.log(`applied: ${applied.join(", ")} in ${duration} ms`);
    console.log("active orders before → after:");

    for (const order of before.orders) {
      const moved = after.orders.find((candidate) => candidate.code === order.code);
      const lines = before.lines.filter((line) => line.code === order.code);
      const linesAfter = after.lines.filter((line) => line.code === order.code);

      console.log(
        `  ${order.code}: total ${order.subTotalWithTax}+${order.shippingWithTax} → ` +
          `${moved?.subTotalWithTax}+${moved?.shippingWithTax}; lines ` +
          `[${lines.map((line) => `${line.listPrice}x${line.quantity}`).join(", ")}] → ` +
          `[${linesAfter.map((line) => `${line.listPrice}x${line.quantity}`).join(", ")}]`
      );
    }

    console.log("rows before → after:");

    for (const [name, count] of before.counts) {
      console.log(`  ${name}: ${count} → ${after.counts.get(name)}`);
    }

    expect(after.orders).toEqual(before.orders);
    expect(after.lines).toEqual(before.lines);

    const definitions = new Map(
      z
        .array(z.object({ nativeProductId: z.number(), definition: z.unknown() }))
        .parse(
          (await pool.query(`select "nativeProductId", definition from product_definition`)).rows
        )
        .map((row) => [row.nativeProductId, ProductDefinitionSchema.parse(row.definition)])
    );
    const repriced = after.lines.flatMap((line) => {
      const definition = definitions.get(line.productId);

      if (definition === undefined) {
        return [];
      }

      const price = computeLineUnitPrice({
        definition,
        productName: definition.id,
        selections: parseLineSelections(line.selections),
        lengthCm: line.lengthCm,
        languageCode: "hu",
      });

      if (price === line.listPrice) {
        return [];
      }

      return [`${line.code}/${line.lineId}: ${line.listPrice} → ${price}`];
    });

    expect(repriced).toEqual([]);

    const { server, adminClient } = createTestEnvironment(config);

    await server.bootstrap();

    try {
      await adminClient.asSuperAdmin();

      const { orders } = await run(
        adminClient,
        `query { orders(options: { take: 100 }) { items { id code } } }`,
        {},
        PlacedSchema
      );

      for (const { id } of orders.items) {
        const { order } = await run(
          adminClient,
          `query($id: ID!) { order(id: $id) {
            code state totalWithTax lines { unitPriceWithTax productVariant { sku name } }
          } }`,
          { id },
          OrderLoadSchema
        );

        console.log(
          `  admin ${order.code} (${order.state}) ${order.totalWithTax}: ` +
            order.lines
              .map((line) => `${line.productVariant.sku} @ ${line.unitPriceWithTax}`)
              .join(", ")
        );
      }

      expect(orders.items.length).toBeGreaterThan(0);
    } finally {
      await server.destroy();
    }
  }, 600_000);
});
