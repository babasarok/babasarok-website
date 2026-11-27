import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { basketProductionDays, type Order, type OrderLine } from "./schemas";

// Seam: the shop API's resolved per-product production days vs. the checkout's
// note — the basket shows its longest line's time.

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [],
});

const line = (
  productDefinition: z.output<typeof ProductDefinitionSchema> | null,
  productionTimeDays = 21
): OrderLine => ({
  id: "10",
  quantity: 1,
  unitPriceWithTax: 11_000,
  discountedLinePriceWithTax: 11_000,
  customFields: null,
  invalidReason: null,
  productVariant: {
    id: "3",
    name: "v",
    options: [],
    product: {
      slug: "parna",
      name: "Párna",
      featuredAsset: null,
      productDefinition,
      productionTimeDays,
    },
  },
});

const order = (lines: OrderLine[]): Order => ({
  id: "1",
  code: "ABC",
  state: "AddingItems",
  currencyCode: "HUF",
  totalQuantity: lines.length,
  subTotalWithTax: 0,
  shippingWithTax: 0,
  totalWithTax: 0,
  discounts: [],
  shippingLines: [],
  customer: null,
  shippingAddress: null,
  billingAddress: null,
  customFields: null,
  lines,
});

describe("basketProductionDays", () => {
  it("is the longest line's production time", () => {
    expect(basketProductionDays(order([line(null, 7), line(definition, 21)]))).toBe(21);
    expect(basketProductionDays(order([line(definition, 21), line(null, 3)]))).toBe(21);
    expect(basketProductionDays(order([line(null, 3)]))).toBe(3);
  });

  it("is undefined for an empty basket", () => {
    expect(basketProductionDays(order([]))).toBeUndefined();
  });
});
