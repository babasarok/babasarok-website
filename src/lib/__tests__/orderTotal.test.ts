/**
 * Order total and one-pass basket pricing.
 *
 * `resolveBasketPricing` resolves the whole basket's set allocation once,
 * returning per-item set status, the formed instances (each carrying its
 * clamped forint discount), the items subtotal, and the total set discount.
 * `orderTotal` is the single figure the checkout display and the submitted
 * order share, so the price shown always equals the price charged.
 * See the `product-sets` and `order-pricing` specs in `docs/specs/`.
 */
import { describe, expect, it } from "vitest";
import { resolveBasketPricing, type SetDiscountGroup } from "@/lib/pricing/setDiscount";
import { orderTotal } from "@/lib/order/total";
import type { IProduct, ProductMaterialValue } from "@/lib/types.svelte";
import { makeProduct } from "./fixtures";

const val = (material_id: string, colors: string[]): ProductMaterialValue => ({
  material_id,
  colors,
});
const red = [val("cotton", ["red"])];

const setGroups: SetDiscountGroup[] = [
  {
    title: "Babafészek szett",
    discount_amount: 1500,
    products: [{ product_id: "nest" }, { product_id: "blanket" }],
  },
];
const nest = (uuid: string, price: number): IProduct =>
  makeProduct({ uuid, product_id: "nest", price, values: red });
const blanket = (uuid: string, price: number): IProduct =>
  makeProduct({ uuid, product_id: "blanket", price, values: red });

describe("resolveBasketPricing", () => {
  it("sums the items subtotal, treating unpriced parts as zero", () => {
    const known = makeProduct({ price: 5000 });
    const unpriced = makeProduct({ price: 0 });
    expect(resolveBasketPricing([known, unpriced], []).itemsTotal).toBe(5000);
  });

  it("bundles each formed instance's clamped amount and nominal", () => {
    const pricing = resolveBasketPricing([nest("u1", 10_000), blanket("u2", 10_000)], setGroups);
    expect(pricing.instances).toEqual([
      { setTitle: "Babafészek szett", members: ["u1", "u2"], nominal: 1500, amount: 1500 },
    ]);
    expect(pricing.setDiscountTotal).toBe(1500);
  });

  it("clamps the set discount to the covered subtotal", () => {
    // Two 300 Ft members can absorb only 600 Ft of a 1500 Ft set discount.
    const pricing = resolveBasketPricing([nest("u1", 300), blanket("u2", 300)], setGroups);
    expect(pricing.instances[0]).toEqual({
      setTitle: "Babafészek szett",
      members: ["u1", "u2"],
      nominal: 1500,
      amount: 600,
    });
    expect(pricing.setDiscountTotal).toBe(600);
  });

  it("exposes the per-item set status in one pass", () => {
    const pricing = resolveBasketPricing([nest("u1", 10_000), blanket("u2", 10_000)], setGroups);
    expect(pricing.statuses.get("u1")).toEqual({
      state: "active",
      setTitle: "Babafészek szett",
      count: 1,
    });
  });
});

describe("orderTotal", () => {
  it("is items subtotal minus set discount plus delivery", () => {
    const pricing = resolveBasketPricing([nest("u1", 10_000), blanket("u2", 10_000)], setGroups);
    // 20000 items - 1500 set discount + 990 delivery
    expect(orderTotal(pricing, 990)).toBe(19_490);
  });

  it("adds only delivery when no set discount is earned", () => {
    const pricing = resolveBasketPricing([makeProduct({ price: 8000 })], []);
    expect(orderTotal(pricing, 990)).toBe(8990);
  });
});
