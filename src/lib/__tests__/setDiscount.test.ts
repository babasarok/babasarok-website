/**
 * Set (product-group) discount resolution.
 *
 * Two concerns are covered: exact material matching (`materialsMatch`) and the
 * basket-aware active-discount resolver (`resolveActiveSetDiscount`), which only
 * grants a set's discount when a matching-material sibling is also present.
 * See docs/set-pricing-model.md.
 */
import { describe, expect, it } from "vitest";
import {
  materialsMatch,
  resolveActiveSetDiscount,
  resolveSetDiscount,
  resolveSetDiscountStatus,
  canSyncMaterials,
  calculatePriceForItem,
  type SetDiscountGroup,
} from "@/lib/priceUtils";
import type { ProductMaterialValue } from "@/lib/types.svelte";
import { makeProduct, makeMaterial } from "./fixtures";

const val = (
  material_id: string,
  colors: string[],
  custom_color?: string
): ProductMaterialValue => ({
  material_id,
  colors,
  ...(custom_color === undefined ? {} : { custom_color }),
});

describe("materialsMatch", () => {
  it("matches two products with identical material selections", () => {
    const a = makeProduct({ values: [val("cotton", ["red", "blue"])] });
    const b = makeProduct({ values: [val("cotton", ["red", "blue"])] });
    expect(materialsMatch(a, b)).toBe(true);
  });

  it("is order-independent for colours and materials", () => {
    const a = makeProduct({ values: [val("cotton", ["red", "blue"]), val("wool", ["green"])] });
    const b = makeProduct({ values: [val("wool", ["green"]), val("cotton", ["blue", "red"])] });
    expect(materialsMatch(a, b)).toBe(true);
  });

  it("ignores the transient error field", () => {
    const a = makeProduct({ values: [{ ...val("cotton", ["red"]), error: "oops" }] });
    const b = makeProduct({ values: [val("cotton", ["red"])] });
    expect(materialsMatch(a, b)).toBe(true);
  });

  it("does not match different colours", () => {
    const a = makeProduct({ values: [val("cotton", ["red"])] });
    const b = makeProduct({ values: [val("cotton", ["blue"])] });
    expect(materialsMatch(a, b)).toBe(false);
  });

  it("does not match different material ids", () => {
    const a = makeProduct({ values: [val("cotton", ["red"])] });
    const b = makeProduct({ values: [val("wool", ["red"])] });
    expect(materialsMatch(a, b)).toBe(false);
  });

  it("does not match different material counts", () => {
    const a = makeProduct({ values: [val("cotton", ["red"]), val("wool", ["green"])] });
    const b = makeProduct({ values: [val("cotton", ["red"])] });
    expect(materialsMatch(a, b)).toBe(false);
  });

  it("distinguishes custom colours", () => {
    const a = makeProduct({ values: [val("cotton", [], "#abc")] });
    const b = makeProduct({ values: [val("cotton", [], "#def")] });
    expect(materialsMatch(a, b)).toBe(false);
  });

  it("matches two products with no material selections", () => {
    expect(materialsMatch(makeProduct(), makeProduct())).toBe(true);
  });
});

const groups: SetDiscountGroup[] = [
  {
    title: "Babafészek szett",
    products: [
      { product_id: "nest", discount_percent: 10 },
      { product_id: "blanket", discount_percent: 15 },
    ],
  },
];

describe("resolveActiveSetDiscount", () => {
  it("returns nothing when the item is alone in the basket", () => {
    const nest = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    expect(resolveActiveSetDiscount(nest, [nest], groups)).toBeUndefined();
  });

  it("grants the discount when a matching-material sibling is present", () => {
    const nest = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const blanket = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      values: [val("cotton", ["red"])],
    });
    const basket = [nest, blanket];
    expect(resolveActiveSetDiscount(nest, basket, groups)?.percent).toBe(10);
    expect(resolveActiveSetDiscount(blanket, basket, groups)?.percent).toBe(15);
  });

  it("does not grant the discount when the sibling's materials differ", () => {
    const nest = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const blanket = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      values: [val("cotton", ["blue"])],
    });
    const basket = [nest, blanket];
    expect(resolveActiveSetDiscount(nest, basket, groups)).toBeUndefined();
    expect(resolveActiveSetDiscount(blanket, basket, groups)).toBeUndefined();
  });

  it("picks the biggest discount across active sets", () => {
    const multiGroups: SetDiscountGroup[] = [
      {
        title: "Small set",
        products: [
          { product_id: "nest", discount_percent: 5 },
          { product_id: "blanket", discount_percent: 5 },
        ],
      },
      {
        title: "Big set",
        products: [
          { product_id: "nest", discount_percent: 20 },
          { product_id: "pillow", discount_percent: 20 },
        ],
      },
    ];
    const nest = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const blanket = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      values: [val("cotton", ["red"])],
    });
    const pillow = makeProduct({
      uuid: "u3",
      product_id: "pillow",
      values: [val("cotton", ["red"])],
    });
    expect(resolveActiveSetDiscount(nest, [nest, blanket, pillow], multiGroups)?.percent).toBe(20);
  });
});

describe("resolveSetDiscount (potential)", () => {
  it("returns the biggest membership discount regardless of the basket", () => {
    expect(resolveSetDiscount("blanket", groups)?.percent).toBe(15);
    expect(resolveSetDiscount("unknown", groups)).toBeUndefined();
  });
});

describe("canSyncMaterials", () => {
  it("is true when counts match and every partner material is available", () => {
    const item = makeProduct({
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    const partner = makeProduct({ values: [val("cotton", ["red"])], material_required_count: 1 });
    expect(canSyncMaterials(item, partner)).toBe(true);
  });

  it("is false when the item does not offer the partner's material", () => {
    const item = makeProduct({
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    const partner = makeProduct({ values: [val("wool", ["red"])], material_required_count: 1 });
    expect(canSyncMaterials(item, partner)).toBe(false);
  });

  it("is false when the required material counts differ", () => {
    const item = makeProduct({
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 2,
    });
    const partner = makeProduct({ values: [val("cotton", ["red"])], material_required_count: 1 });
    expect(canSyncMaterials(item, partner)).toBe(false);
  });
});

describe("resolveSetDiscountStatus", () => {
  it("returns undefined when the item earns no set discount", () => {
    const other = makeProduct({ uuid: "u1", product_id: "unknown" });
    expect(resolveSetDiscountStatus(other, [other], groups)).toBeUndefined();
  });

  it("reports pending-partner when no set sibling is in the basket", () => {
    const nest = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    expect(resolveSetDiscountStatus(nest, [nest], groups)).toEqual({
      state: "pending-partner",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("reports active when a matching-material sibling is present", () => {
    const nest = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const blanket = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      values: [val("cotton", ["red"])],
    });
    expect(resolveSetDiscountStatus(nest, [nest, blanket], groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("caps the active count to the smallest matching partner count", () => {
    const nest = makeProduct({
      uuid: "u1",
      product_id: "nest",
      count: 2,
      values: [val("cotton", ["red"])],
    });
    const blanket = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      count: 1,
      values: [val("cotton", ["red"])],
    });
    expect(resolveSetDiscountStatus(nest, [nest, blanket], groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("reports pending-material with a syncable partner when materials differ", () => {
    const nest = makeProduct({
      uuid: "u1",
      product_id: "nest",
      values: [val("cotton", ["red"])],
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    const blanket = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      values: [val("cotton", ["blue"])],
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    expect(resolveSetDiscountStatus(nest, [nest, blanket], groups)).toEqual({
      state: "pending-material",
      percent: 10,
      setTitle: "Babafészek szett",
      partnerUuid: "u2",
      canSync: true,
      count: 1,
    });
  });
});

describe("calculatePriceForItem with a set discount", () => {
  it("applies the set discount and marks the source", () => {
    const product = makeProduct({ price: 10_000, count: 1 });
    const price = calculatePriceForItem(product, {
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(price.totalPrice).toBe(9000);
    expect(price.discountInfo?.discountSource).toBe("set");
    expect(price.discountInfo?.discountAppliedCount).toBe(1);
  });

  it("applies the set discount only to the matched count of a larger quantity", () => {
    // 2 items in the basket, but the set partner only covers 1 → discount on 1 of 2.
    const product = makeProduct({ price: 10_000, count: 2 });
    const price = calculatePriceForItem(product, {
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    // discount factor = (1 - 10%*1/2) = 0.95 per unit, so total = 20000 * 0.95 = 19000
    expect(price.totalPrice).toBe(19000);
    expect(price.discountInfo?.discountAppliedCount).toBe(1);
  });

  it("lets the set discount replace a standalone discount even when expired", () => {
    const product = makeProduct({
      price: 10_000,
      count: 1,
      discount: 50,
      discount_valid_until: "2000-01-01",
    });
    const price = calculatePriceForItem(product, {
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(price.totalPrice).toBe(9000);
    expect(price.discountInfo?.discountSource).toBe("set");
  });
});
