/**
 * Seam: native-product drift vs. the definition staleness the dashboard
 * shows. A variant edited outside the sync (here: its price, through the
 * stock admin API) must flag its definition as stale on both the single
 * definition and the definitions list — the list nests `stale` under
 * `items`, and a selection-sniffing shortcut once missed it there and
 * reported every definition as fresh.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";
import { kendo } from "./lines";
import { setVariantPrice } from "./shop";

const ListSchema = z.object({
  productDefinitions: z.object({
    items: z.array(z.object({ productId: z.string(), stale: z.boolean() })),
  }),
});

const SingleSchema = z.object({
  productDefinition: z.object({
    stale: z.boolean(),
    driftDetails: z.array(z.object({ kind: z.string() })).nullable(),
  }),
});

let server: IntegrationServer;

async function listedStaleness(productId: string): Promise<boolean | undefined> {
  const { productDefinitions } = await run(
    server.admin,
    `query { productDefinitions(options: { take: 100 }) { items { productId stale } } }`,
    {},
    ListSchema
  );

  return productDefinitions.items.find((item) => item.productId === productId)?.stale;
}

async function singleStaleness(productId: string): Promise<z.infer<typeof SingleSchema>> {
  return run(
    server.admin,
    `query($productId: String!) { productDefinition(productId: $productId) { stale driftDetails { kind } } }`,
    { productId },
    SingleSchema
  );
}

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

describe("definition staleness", () => {
  it("is fresh right after the sync", async () => {
    expect(await listedStaleness("int-kendo")).toBe(false);
    expect((await singleStaleness("int-kendo")).productDefinition.stale).toBe(false);
  });

  it("flags a variant edited outside the sync on the list and on the single definition", async () => {
    await setVariantPrice(server, kendo().sku, 401);

    expect(await listedStaleness("int-kendo")).toBe(true);

    const { productDefinition } = await singleStaleness("int-kendo");

    expect(productDefinition.stale).toBe(true);
    expect(productDefinition.driftDetails).toEqual([{ kind: "price" }]);
  });
});
