import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { hasConfigurableLine, type Order, type OrderLine } from "./schemas";

// Seam: the basket's line composition vs. the checkout's lead-time note —
// a made-to-order line means production time; a ready-made-only basket ships
// from stock.

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [],
});

const line = (productDefinition: z.output<typeof ProductDefinitionSchema> | null): OrderLine => ({
  id: "10",
  quantity: 1,
  unitPriceWithTax: 11_000,
  discountedLinePriceWithTax: 11_000,
  customFields: null,
  invalidReason: null,
  productVariant: {
    id: "3",
    name: "v",
    product: { slug: "parna", name: "Párna", featuredAsset: null, productDefinition },
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

describe("hasConfigurableLine", () => {
  it("is true when a line's product has a definition", () => {
    expect(hasConfigurableLine(order([line(null), line(definition)]))).toBe(true);
  });

  it("is false for a ready-made-only basket", () => {
    expect(hasConfigurableLine(order([line(null), line(null)]))).toBe(false);
  });

  it("is false for an empty basket", () => {
    expect(hasConfigurableLine(order([]))).toBe(false);
  });
});
