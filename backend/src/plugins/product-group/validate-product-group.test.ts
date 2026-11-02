import { describe, expect, it } from "vitest";
import {
  promotionGroupIds,
  validateProductGroupInput,
  type ProductGroupInputData,
} from "./validate-product-group";

const input = (overrides: Partial<ProductGroupInputData> = {}): ProductGroupInputData => ({
  label: "Babafészek szett",
  kind: "discounted-set",
  discount: 1000,
  productIds: ["babafeszek", "babatakaro-szett"],
  ...overrides,
});

const existing = new Set(["babafeszek", "babatakaro-szett", "ovis-zsak"]);

describe("validateProductGroupInput", () => {
  it("accepts a valid discounted set", () => {
    const result = validateProductGroupInput("babafeszek-szett", input(), existing);

    expect(result).toEqual({
      success: true,
      definition: {
        kind: "discounted-set",
        id: "babafeszek-szett",
        label: "Babafészek szett",
        discount: 1000,
        productIds: ["babafeszek", "babatakaro-szett"],
      },
    });
  });

  it("rejects a set with a zero discount", () => {
    const result = validateProductGroupInput("szett", input({ discount: 0 }), existing);

    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const result = validateProductGroupInput(
      "szett",
      input({ kind: "bundle", discount: null }),
      existing
    );

    expect(result.success).toBe(false);
  });

  it("rejects fewer than two members", () => {
    const result = validateProductGroupInput(
      "szett",
      input({ productIds: ["babafeszek"] }),
      existing
    );

    expect(result.success).toBe(false);
  });

  it("rejects members that are not product definitions", () => {
    const result = validateProductGroupInput(
      "szett",
      input({ productIds: ["babafeszek", "nincs-ilyen"] }),
      existing
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.join(" ")).toContain("nincs-ilyen");
    }
  });

  it("accepts a related-items group without a discount", () => {
    const result = validateProductGroupInput(
      "ovis-felszereles",
      input({
        label: "Ovis felszerelés",
        kind: "related-items",
        discount: null,
        productIds: ["ovis-zsak", "babafeszek"],
      }),
      existing
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.definition.kind).toBe("related-items");
    }
  });

  it("ignores a discount sent for a related-items group", () => {
    const result = validateProductGroupInput(
      "ovis",
      input({ kind: "related-items", discount: 500 }),
      existing
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.definition).not.toHaveProperty("discount");
    }
  });
});

describe("promotionGroupIds", () => {
  it("reads the groupIds of our condition code", () => {
    const ids = promotionGroupIds([
      {
        code: "babasarok-product-set-basket",
        args: [{ name: "groupIds", value: '["a","b"]' }],
      },
    ]);

    expect(ids).toEqual(["a", "b"]);
  });

  it("ignores other conditions and unparsable values", () => {
    const ids = promotionGroupIds([
      {
        code: "order_min_amount",
        args: [{ name: "minimum", value: "1000" }],
      },
      {
        code: "babasarok-product-set-basket",
        args: [{ name: "groupIds", value: "not-json" }],
      },
    ]);

    expect(ids).toEqual([]);
  });
});
