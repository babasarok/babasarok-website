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
import { calculateUnitPrice } from "./pricing-strategy";
import { ProductDefinition } from "../product/product.entity";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
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
const lengthDefinition = ProductDefinitionSchema.parse({
  id: "parna-meter",
  basePrice: 9000,
  pricing: { kind: "length", sourceFieldId: "hossz" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "input",
      id: "hossz",
      label: { hu: "Hossz" },
      visibility: { kind: "always" },
      required: true,
      price: 0,
    },
  ],
});
const lengthRow = new ProductDefinition({ definition: lengthDefinition, productId: "parna-meter" });

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

  it("keeps the last price of a line whose definition can no longer price it", async () => {
    const line = new OrderLine({
      productVariantId: 7,
      customFields: {},
      listPrice: 8500,
      listPriceIncludesTax: false,
    });
    const result = await calculateUnitPrice(
      depsFor(lengthRow),
      ctx,
      variant,
      {},
      new Order({ lines: [line] })
    );

    expect(result).toEqual({ price: 8500, priceIncludesTax: false });
  });

  it("refuses a new line whose length is missing", async () => {
    await expect(
      calculateUnitPrice(depsFor(lengthRow), ctx, variant, {}, new Order({ lines: [] }))
    ).rejects.toThrow("Árazási hiba");
  });
});
