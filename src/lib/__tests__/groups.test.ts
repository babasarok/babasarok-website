import { describe, expect, it } from "vitest";
import { resolveSetDiscount, isSet, siblingsFor, relatedGroupsFor } from "@/lib/order/groups";
import type { OrderProductGroup } from "@/lib/order/types";

const groups: OrderProductGroup[] = [
  {
    title: "Babafészek szett",
    discount_amount: 1000,
    products: [{ product_id: "nest" }, { product_id: "blanket" }],
  },
];

describe("resolveSetDiscount (potential)", () => {
  it("returns the biggest set discount regardless of the basket", () => {
    expect(resolveSetDiscount("blanket", groups)?.amount).toBe(1000);
    expect(resolveSetDiscount("unknown", groups)).toBeUndefined();
  });

  it("picks the biggest-amount set when a product is in several", () => {
    const multi: OrderProductGroup[] = [
      { title: "Small", discount_amount: 500, products: [{ product_id: "nest" }] },
      { title: "Big", discount_amount: 2000, products: [{ product_id: "nest" }] },
    ];
    expect(resolveSetDiscount("nest", multi)).toEqual({ amount: 2000, setTitle: "Big" });
  });

  it("ignores a group with a zero or absent discount", () => {
    const noDiscount: OrderProductGroup[] = [
      { title: "Related", discount_amount: 0, products: [{ product_id: "nest" }] },
      { title: "Related2", products: [{ product_id: "nest" }] },
    ];
    expect(resolveSetDiscount("nest", noDiscount)).toBeUndefined();
  });
});

describe("membership queries", () => {
  const nestSet: OrderProductGroup = {
    title: "Babafészek szett",
    discount_amount: 1000,
    products: [{ product_id: "nest" }, { product_id: "blanket" }, { product_id: "pillow" }],
  };
  const bigSet: OrderProductGroup = {
    title: "Nagy szett",
    discount_amount: 3000,
    products: [{ product_id: "nest" }, { product_id: "sheet" }],
  };
  const relatedA: OrderProductGroup = {
    title: "Kapcsolódó A",
    discount_amount: 0,
    products: [{ product_id: "nest" }, { product_id: "toy" }],
  };
  const relatedB: OrderProductGroup = {
    // Absent amount is also "related items", not a set.
    title: "Kapcsolódó B",
    products: [{ product_id: "nest" }, { product_id: "mobile" }],
  };
  const all = [nestSet, bigSet, relatedA, relatedB];

  describe("isSet", () => {
    it("is true for a positive discount amount", () => {
      expect(isSet(nestSet)).toBe(true);
    });
    it("is false for a zero or absent amount", () => {
      expect(isSet(relatedA)).toBe(false);
      expect(isSet(relatedB)).toBe(false);
    });
  });

  describe("siblingsFor", () => {
    it("merges the other members of every discount set the product is in", () => {
      // nest is in nestSet (blanket, pillow) and bigSet (sheet); related groups
      // contribute nothing.
      expect(siblingsFor("nest", all)).toEqual(["blanket", "pillow", "sheet"]);
    });
    it("excludes the product itself and de-duplicates across sets", () => {
      const dup: OrderProductGroup[] = [
        { title: "A", discount_amount: 1, products: [{ product_id: "nest" }, { product_id: "x" }] },
        { title: "B", discount_amount: 1, products: [{ product_id: "nest" }, { product_id: "x" }] },
      ];
      expect(siblingsFor("nest", dup)).toEqual(["x"]);
    });
    it("returns nothing for a product in no discount set", () => {
      expect(siblingsFor("toy", all)).toEqual([]);
    });
  });

  describe("relatedGroupsFor", () => {
    it("lists each no-discount group the product is in with its other members", () => {
      expect(relatedGroupsFor("nest", all)).toEqual([
        { title: "Kapcsolódó A", members: ["toy"] },
        { title: "Kapcsolódó B", members: ["mobile"] },
      ]);
    });
    it("ignores discount sets", () => {
      expect(relatedGroupsFor("sheet", all)).toEqual([]);
    });
  });
});
