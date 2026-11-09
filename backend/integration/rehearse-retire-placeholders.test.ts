/**
 * Rehearsal of the placeholder retirement on a copy of production (not a test
 * of this repo's code paths; skipped unless REHEARSAL_DATABASE_URL is set).
 * Loads every order through the admin API exactly as the dashboard reads it
 * (dashboard-order.ts), runs the pending migrations, and fails if any order
 * view moved, if a placeholder product or search-index row survives, or if a
 * line lost its variant/product reference. Prints the placeholder lines.
 *
 *   docker exec babasarok-website-postgres-1 psql -U babasarok -d postgres \
 *     -c "DROP DATABASE babasarok WITH (FORCE);" \
 *     -c "CREATE DATABASE babasarok TEMPLATE babasarok_prod_snapshot;"
 *   pnpm -C backend run build
 *   REHEARSAL_DATABASE_URL=postgres://babasarok:babasarok@localhost:5432/babasarok \
 *     pnpm -C backend exec vitest run --config vitest.integration.config.ts \
 *     integration/rehearse-retire-placeholders.test.ts
 *
 * The database is booted twice (before and after the migrations): the
 * retirement is a data migration, so the built server's schema matches the
 * pre-migration copy and the admin API can snapshot it as-is.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { z } from "zod";
import { defaultConfig, mergeConfig, NoopLogger, runMigrations } from "@vendure/core";
import { createTestEnvironment } from "@vendure/testing";
import type { SimpleGraphQLClient, TestServer } from "@vendure/testing";
import { config as appConfig } from "../dist/vendure-config";
import { dashboardOrders } from "./dashboard-order";
import { run } from "./harness";

const url = process.env.REHEARSAL_DATABASE_URL;

const ProductListSchema = z.object({
  products: z.object({ items: z.array(z.object({ slug: z.string() })) }),
});

const CountRow = z.object({ name: z.string(), n: z.number() });

const PLACEHOLDER_COUNTS = `
  select 'placeholder products' as name, count(*)::int as n
    from product p join product_translation t on t."baseId" = p.id
    where t.slug ilike 'placeholder-%' and p."deletedAt" is null
  union all select 'placeholder variants' as name, count(*)::int as n
    from product_variant v where v.sku ilike 'placeholder-%' and v."deletedAt" is null
  union all select 'placeholder search rows' as name, count(*)::int as n
    from search_index_item s join product_variant v on v.id = s."productVariantId"
    where v.sku ilike 'placeholder-%'
  union all select 'orders' as name, count(*)::int as n from "order"
  union all select 'order lines' as name, count(*)::int as n from order_line
`;

function assertLocal(databaseUrl: string): void {
  const { hostname, pathname } = new URL(databaseUrl);

  if (!["localhost", "127.0.0.1"].includes(hostname) || pathname === "/babasarok_prod_snapshot") {
    throw new Error("The rehearsal only runs against a local copy, never the snapshot itself.");
  }
}

const pool = url === undefined ? undefined : new Pool({ connectionString: url, max: 1 });

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(url === undefined || pool === undefined)("placeholder-retirement rehearsal", () => {
  it("retires the placeholders without moving any order's dashboard view", async () => {
    if (url === undefined || pool === undefined) {
      return;
    }

    assertLocal(url);

    const config = mergeConfig(mergeConfig(defaultConfig, appConfig), {
      logger: new NoopLogger(),
      dbConnectionOptions: { url, logging: false },
      authOptions: {
        superadminCredentials: {
          identifier: "retire-placeholders-rehearsal",
          password: "retire-placeholders-rehearsal-only",
        },
      },
    });

    const boot = async (): Promise<{
      server: TestServer;
      admin: SimpleGraphQLClient;
    }> => {
      const { server, adminClient } = createTestEnvironment(config);

      await server.bootstrap();
      await adminClient.asSuperAdmin();

      return { server, admin: adminClient };
    };

    const counts = async (): Promise<Map<string, number>> =>
      new Map(
        z
          .array(CountRow)
          .parse((await pool.query(PLACEHOLDER_COUNTS)).rows)
          .map((row) => [row.name, row.n])
      );

    const slugs = async (admin: Awaited<ReturnType<typeof boot>>["admin"]): Promise<string[]> => {
      const { products } = await run(
        admin,
        `query { products(options: { take: 100 }) { items { slug } } }`,
        {},
        ProductListSchema
      );

      return products.items.map((item) => item.slug);
    };

    const beforeServer = await boot();
    const beforeOrders = await dashboardOrders(beforeServer.admin);
    const beforeCounts = await counts();
    const beforeSlugs = await slugs(beforeServer.admin);

    try {
      console.log("placeholder lines before the migration:");

      for (const order of beforeOrders) {
        for (const line of order.lines) {
          if (line.productVariant.sku.toLowerCase().startsWith("placeholder-")) {
            console.log(
              `  ${order.code} (${order.state}) line ${line.id}: ${line.productVariant.sku} ` +
                `x${line.quantity} @ ${line.unitPriceWithTax}, title=${line.customFields.title ?? ""}`
            );
          }
        }
      }

      expect(beforeCounts.get("placeholder products")).toBeGreaterThan(0);
      expect(beforeSlugs.some((slug) => slug.startsWith("placeholder-"))).toBe(true);
    } finally {
      await beforeServer.server.destroy();
    }

    const applied = await runMigrations(config);
    const afterServer = await boot();

    try {
      const afterOrders = await dashboardOrders(afterServer.admin);
      const afterCounts = await counts();
      const afterSlugs = await slugs(afterServer.admin);

      console.log(`applied: ${applied.join(", ")}`);
      console.log("rows before → after:");

      for (const [name, count] of beforeCounts) {
        console.log(`  ${name}: ${count} → ${afterCounts.get(name)}`);
      }

      expect(afterOrders).toEqual(beforeOrders);
      expect(afterCounts.get("placeholder products")).toBe(0);
      expect(afterCounts.get("placeholder variants")).toBe(0);
      expect(afterCounts.get("placeholder search rows")).toBe(0);
      expect(afterCounts.get("orders")).toBe(beforeCounts.get("orders"));
      expect(afterCounts.get("order lines")).toBe(beforeCounts.get("order lines"));
      expect(afterSlugs.some((slug) => slug.startsWith("placeholder-"))).toBe(false);

      for (const order of afterOrders) {
        for (const line of order.lines) {
          expect(line.productVariant.sku).not.toBe("");
          expect(line.productVariant.name).not.toBe("");
          expect(line.productVariant.product.id).not.toBe("");
          expect(line.productVariant.product.name).not.toBe("");
        }
      }
    } finally {
      await afterServer.server.destroy();
    }
  }, 600_000);
});
