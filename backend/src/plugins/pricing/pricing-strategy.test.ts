import { ProductDefinitionSchema } from "@babasarok/product-definition";
import type { Order, OrderLine, ProductVariant, RequestContext } from "@vendure/core";
import { LanguageCode, type Injector } from "@vendure/core";
import { describe, expect, it } from "vitest";
import { ServerPricingStrategy } from "./pricing-strategy";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  orderable: true,
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [],
});

const ctx = { languageCode: LanguageCode.hu } as RequestContext;

function strategyFor(
  row: { definition: unknown; productId: string } | null
): ServerPricingStrategy {
  const connection = {
    getRepository: () => ({
      findOne: async () => row,
      find: async () => [{ id: 3, translations: [] }],
    }),
  };
  const entityHydrator = { hydrate: () => Promise.resolve() };
  const strategy = new ServerPricingStrategy();

  strategy.init({
    get: (type: { name: string }) => (type.name === "EntityHydrator" ? entityHydrator : connection),
  } as unknown as Injector);

  return strategy;
}

const variant = {
  id: 7,
  productId: 3,
  listPrice: 9000,
  listPriceIncludesTax: false,
  options: [],
} as unknown as ProductVariant;

function orderWith(lines: Array<Partial<OrderLine>>): Order {
  return { lines } as unknown as Order;
}

describe("ServerPricingStrategy", () => {
  it("passes the variant price through for a product without a definition", async () => {
    const result = await strategyFor(null).calculateUnitPrice(ctx, variant, {}, orderWith([]), 1);

    expect(result).toEqual({ price: 9000, priceIncludesTax: false });
  });

  it("prices a generated product from its definition", async () => {
    const result = await strategyFor({ definition, productId: "parna" }).calculateUnitPrice(
      ctx,
      variant,
      {},
      orderWith([]),
      1
    );

    expect(result.price).toBe(9000);
  });

  const stale = { definition: { ...definition, orderable: false }, productId: "parna" };

  it("keeps the last price of a stale line already on the order", async () => {
    const line = {
      productVariantId: 7,
      customFields: {},
      listPrice: 8500,
      listPriceIncludesTax: false,
    };
    const result = await strategyFor(stale).calculateUnitPrice(
      ctx,
      variant,
      {},
      orderWith([line]),
      1
    );

    expect(result).toEqual({ price: 8500, priceIncludesTax: false });
  });

  it("refuses a new invalid line", async () => {
    await expect(
      strategyFor(stale).calculateUnitPrice(ctx, variant, {}, orderWith([]), 1)
    ).rejects.toThrow("Árazási hiba");
  });
});
