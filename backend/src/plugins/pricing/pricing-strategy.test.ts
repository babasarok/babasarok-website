import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import {
  Channel,
  LanguageCode,
  Order,
  OrderLine,
  ProductVariant,
  RequestContext,
} from "@vendure/core";
import { describe, expect, it } from "vitest";
import type { LineValuationDeps } from "./line-valuation";
import { refuseInvalidLines, type LineValidityDeps } from "./line-validity-process";
import { calculateUnitPrice } from "./pricing-strategy";
import { ProductDefinition } from "../product/product.entity";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  orderable: true,
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [],
});

const ctx = new RequestContext({
  apiType: "shop",
  isAuthorized: false,
  authorizedAsOwnerOnly: false,
  channel: new Channel(),
  languageCode: LanguageCode.hu,
});

function depsFor(row: ProductDefinition | null): LineValuationDeps {
  return {
    findDefinition: async () => row,
    productName: async () => "",
    hydrateOptions: () => Promise.resolve(),
  };
}

const variant = new ProductVariant({
  id: 7,
  productId: 3,
  listPrice: 9000,
  listPriceIncludesTax: false,
  options: [],
});

const definitionRow = new ProductDefinition({ definition, productId: "parna" });
const stale = new ProductDefinition({
  definition: { ...definition, orderable: false },
  productId: "parna",
});

describe("calculateUnitPrice", () => {
  it("passes the variant price through for a product without a definition", async () => {
    const result = await calculateUnitPrice(
      depsFor(null),
      ctx,
      variant,
      {},
      new Order({ lines: [] })
    );

    expect(result).toEqual({ price: 9000, priceIncludesTax: false });
  });

  it("prices a generated product from its definition", async () => {
    const result = await calculateUnitPrice(
      depsFor(definitionRow),
      ctx,
      variant,
      {},
      new Order({ lines: [] })
    );

    expect(result.price).toBe(9000);
  });

  it("keeps the last price of a stale line already on the order", async () => {
    const line = new OrderLine({
      productVariantId: 7,
      customFields: {},
      listPrice: 8500,
      listPriceIncludesTax: false,
    });
    const result = await calculateUnitPrice(
      depsFor(stale),
      ctx,
      variant,
      {},
      new Order({ lines: [line] })
    );

    expect(result).toEqual({ price: 8500, priceIncludesTax: false });
  });

  it("refuses a new invalid line", async () => {
    await expect(
      calculateUnitPrice(depsFor(stale), ctx, variant, {}, new Order({ lines: [] }))
    ).rejects.toThrow("Árazási hiba");
  });
});

describe("refuseInvalidLines", () => {
  const order = new Order({ id: 1 });
  const data = { ctx, order };

  function validityDeps(row: ProductDefinition | null): LineValidityDeps {
    return {
      ...depsFor(row),
      findLines: async () => [new OrderLine({ productVariant: variant, customFields: {} })],
    };
  }

  it("refuses leaving AddingItems while a line is invalid", async () => {
    const message = await refuseInvalidLines(
      validityDeps(stale),
      "AddingItems",
      "ArrangingPayment",
      data
    );

    expect(message).toContain("Árazási hiba");
  });

  it("allows the transition when every line prices", async () => {
    const message = await refuseInvalidLines(
      validityDeps(definitionRow),
      "AddingItems",
      "ArrangingPayment",
      data
    );

    expect(message).toBeUndefined();
  });

  it("ignores other transitions", async () => {
    const message = await refuseInvalidLines(
      validityDeps(stale),
      "ArrangingPayment",
      "Cancelled",
      data
    );

    expect(message).toBeUndefined();
  });
});
