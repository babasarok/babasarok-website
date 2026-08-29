/**
 * Set (product-group) discount resolution.
 *
 * Covers exact material matching (`materialsMatch`) and basket-aware set
 * resolution (`allocateSetDiscounts`), which only grants a set's discount when
 * a matching-material sibling is also present and consumes each basket unit
 * at most once across the whole basket.
 * See docs/set-pricing-model.md.
 */
import { describe, expect, it } from "vitest";
import {
  materialsMatch,
  resolveActiveSetDiscount,
  resolveSetDiscount,
  resolveSetDiscountStatus,
  allocateSetDiscounts,
  canSyncMaterials,
  calculatePriceForItem,
  type SetDiscountGroup,
  type ActiveDiscountStatus,
} from "@/lib/priceUtils";
import type { IProduct, ProductMaterialValue } from "@/lib/types.svelte";
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
    discount_percent: 10,
    products: [{ product_id: "nest" }, { product_id: "blanket" }],
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
    expect(resolveActiveSetDiscount(blanket, basket, groups)?.percent).toBe(10);
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

  it("does not count a second line of the same product as a set partner", () => {
    const nestA = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const nestB = makeProduct({ uuid: "u2", product_id: "nest", values: [val("cotton", ["red"])] });
    expect(resolveActiveSetDiscount(nestA, [nestA, nestB], groups)).toBeUndefined();
    expect(resolveSetDiscountStatus(nestA, [nestA, nestB], groups)?.state).toBe("pending-partner");
  });

  it("covers two sets when two same-product lines pair with one count-2 partner line", () => {
    const nestA = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const nestB = makeProduct({ uuid: "u2", product_id: "nest", values: [val("cotton", ["red"])] });
    const blanket = makeProduct({
      uuid: "u3",
      product_id: "blanket",
      count: 2,
      values: [val("cotton", ["red"])],
    });
    const basket = [nestA, nestB, blanket];
    expect(resolveActiveSetDiscount(nestA, basket, groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(resolveActiveSetDiscount(nestB, basket, groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(resolveActiveSetDiscount(blanket, basket, groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
  });

  it("covers two sets when two distinct nest products pair with one count-2 blanket line", () => {
    const twoNestGroups: SetDiscountGroup[] = [
      {
        title: "Babafészek szett",
        discount_percent: 10,
        products: [{ product_id: "nest" }, { product_id: "nest2" }, { product_id: "blanket" }],
      },
    ];
    const nestA = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const nestB = makeProduct({ uuid: "u2", product_id: "nest2", values: [val("cotton", ["red"])] });
    const blanket = makeProduct({
      uuid: "u3",
      product_id: "blanket",
      count: 2,
      values: [val("cotton", ["red"])],
    });
    const basket = [nestA, nestB, blanket];
    expect(resolveActiveSetDiscount(nestA, basket, twoNestGroups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(resolveActiveSetDiscount(nestB, basket, twoNestGroups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(resolveActiveSetDiscount(blanket, basket, twoNestGroups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
  });

  it("picks the biggest discount across active sets", () => {
    const multiGroups: SetDiscountGroup[] = [
      {
        title: "Small set",
        discount_percent: 5,
        products: [{ product_id: "nest" }, { product_id: "blanket" }],
      },
      {
        title: "Big set",
        discount_percent: 20,
        products: [{ product_id: "nest" }, { product_id: "pillow" }],
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
  it("returns the biggest set discount regardless of the basket", () => {
    expect(resolveSetDiscount("blanket", groups)?.percent).toBe(10);
    expect(resolveSetDiscount("unknown", groups)).toBeUndefined();
  });
});

describe("pricing and UI resolvers agree", () => {
  // `resolveActiveSetDiscount` (actual pricing) and `resolveSetDiscountStatus`
  // (UI state) must never disagree about the earned discount: both derive from
  // the same resolution rule, so pin that rule with concrete expected values
  // and assert both resolvers return them.
  const multiGroups: SetDiscountGroup[] = [
    groups[0],
    {
      title: "Big set",
      discount_percent: 20,
      products: [{ product_id: "nest" }, { product_id: "pillow" }],
    },
  ];

  interface Case {
    name: string;
    item: IProduct;
    basket: IProduct[];
    groups?: SetDiscountGroup[];
    expected: ActiveDiscountStatus | undefined;
  }

  const cases: Case[] = [
    {
      name: "active: one matching sibling",
      item: makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] }),
      basket: [
        makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] }),
        makeProduct({ uuid: "b", product_id: "blanket", values: [val("cotton", ["red"])] }),
      ],
      expected: { state: "active", percent: 10, setTitle: "Babafészek szett", count: 1 },
    },
    {
      name: "active: count capped by one partner line",
      item: makeProduct({
        uuid: "n",
        product_id: "nest",
        count: 3,
        values: [val("cotton", ["red"])],
      }),
      basket: [
        makeProduct({
          uuid: "n",
          product_id: "nest",
          count: 3,
          values: [val("cotton", ["red"])],
        }),
        makeProduct({
          uuid: "b",
          product_id: "blanket",
          count: 2,
          values: [val("cotton", ["red"])],
        }),
      ],
      expected: { state: "active", percent: 10, setTitle: "Babafészek szett", count: 2 },
    },
    {
      name: "active: counts summed across partner lines, capped at item count",
      item: makeProduct({
        uuid: "n",
        product_id: "nest",
        count: 1,
        values: [val("cotton", ["red"])],
      }),
      basket: [
        makeProduct({
          uuid: "n",
          product_id: "nest",
          count: 1,
          values: [val("cotton", ["red"])],
        }),
        makeProduct({
          uuid: "b1",
          product_id: "blanket",
          count: 1,
          values: [val("cotton", ["red"])],
        }),
        makeProduct({
          uuid: "b2",
          product_id: "blanket",
          count: 1,
          values: [val("cotton", ["red"])],
        }),
      ],
      expected: { state: "active", percent: 10, setTitle: "Babafészek szett", count: 1 },
    },
    {
      name: "active: biggest set wins with several sets in play",
      item: makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] }),
      basket: [
        makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] }),
        makeProduct({ uuid: "b", product_id: "blanket", values: [val("cotton", ["red"])] }),
        makeProduct({ uuid: "p", product_id: "pillow", values: [val("cotton", ["red"])] }),
      ],
      groups: multiGroups,
      expected: { state: "active", percent: 20, setTitle: "Big set", count: 1 },
    },
    {
      name: "inactive: sibling's materials differ",
      item: makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] }),
      basket: [
        makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] }),
        makeProduct({ uuid: "b", product_id: "blanket", values: [val("cotton", ["blue"])] }),
      ],
      expected: undefined,
    },
    {
      name: "inactive: item alone in the basket",
      item: makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] }),
      basket: [makeProduct({ uuid: "n", product_id: "nest", values: [val("cotton", ["red"])] })],
      expected: undefined,
    },
  ];

  for (const { name, item, basket, groups: caseGroups, expected } of cases) {
    it(`${name}: pricing and UI see the same active discount`, () => {
      const groupList = caseGroups ?? groups;
      const status = resolveSetDiscountStatus(item, basket, groupList);
      expect(status?.state === "active" ? status : undefined).toStrictEqual(expected);
      expect(resolveActiveSetDiscount(item, basket, groupList)).toStrictEqual(expected);
    });
  }
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

  it("sums the counts of multiple matching partner lines", () => {
    // Two distinct blanket lines (different embroidery, same materials) cover
    // two nests even though no single line has count 2.
    const nest = makeProduct({
      uuid: "u1",
      product_id: "nest",
      count: 2,
      values: [val("cotton", ["red"])],
    });
    const blanketA = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      count: 1,
      values: [val("cotton", ["red"])],
    });
    const blanketB = makeProduct({
      uuid: "u3",
      product_id: "blanket",
      count: 1,
      values: [val("cotton", ["red"])],
    });
    expect(resolveSetDiscountStatus(nest, [nest, blanketA, blanketB], groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
    expect(resolveActiveSetDiscount(nest, [nest, blanketA, blanketB], groups)?.count).toBe(2);
  });

  it("still caps the summed partner count at the item's own count", () => {
    const nest = makeProduct({
      uuid: "u1",
      product_id: "nest",
      count: 1,
      values: [val("cotton", ["red"])],
    });
    const blanketA = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      count: 1,
      values: [val("cotton", ["red"])],
    });
    const blanketB = makeProduct({
      uuid: "u3",
      product_id: "blanket",
      count: 1,
      values: [val("cotton", ["red"])],
    });
    expect(resolveActiveSetDiscount(nest, [nest, blanketA, blanketB], groups)?.count).toBe(1);
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

describe("allocateSetDiscounts (global allocation)", () => {
  const red = [val("cotton", ["red"])];
  const nest = (uuid: string, count = 1): IProduct =>
    makeProduct({ uuid, product_id: "nest", count, values: red });
  const blanket = (uuid: string, count = 1): IProduct =>
    makeProduct({ uuid, product_id: "blanket", count, values: red });

  it("allocates each partner unit at most once across the basket", () => {
    // Two nest lines + one blanket line = exactly one set, not two.
    const basket = [nest("u1"), nest("u2"), blanket("u3")];
    const statuses = allocateSetDiscounts(basket, groups);
    expect(statuses.get("u1")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u2")).toEqual({
      state: "pending-partner",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("covers only as many units of a line as the partner has units", () => {
    const statuses = allocateSetDiscounts([nest("u1", 2), blanket("u3")], groups);
    expect(statuses.get("u1")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("covers equal lines evenly when the partner is the limiting resource", () => {
    const statuses = allocateSetDiscounts(
      [nest("u1", 2), nest("u2", 2), blanket("u3", 2)],
      groups
    );
    expect(statuses.get("u1")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u2")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
  });

  it("pairs across three products up to the maximum feasible pairs", () => {
    const trio: SetDiscountGroup[] = [
      {
        title: "Trio",
        discount_percent: 20,
        products: [{ product_id: "a" }, { product_id: "b" }, { product_id: "c" }],
      },
    ];
    const a = makeProduct({ uuid: "u1", product_id: "a", count: 2, values: red });
    const b = makeProduct({ uuid: "u2", product_id: "b", values: red });
    const c = makeProduct({ uuid: "u3", product_id: "c", count: 2, values: red });
    const statuses = allocateSetDiscounts([a, b, c], trio);
    expect(statuses.get("u1")).toEqual({
      state: "active",
      percent: 20,
      setTitle: "Trio",
      count: 2,
    });
    expect(statuses.get("u2")).toEqual({
      state: "active",
      percent: 20,
      setTitle: "Trio",
      count: 1,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      percent: 20,
      setTitle: "Trio",
      count: 1,
    });
  });

  it("breaks pairing ties by basket order", () => {
    const a = nest("u1");
    const b = nest("u2");
    const c = blanket("u3");
    expect(allocateSetDiscounts([a, b, c], groups).get("u1")?.state).toBe("active");
    expect(allocateSetDiscounts([c, b, a], groups).get("u1")?.state).toBe("pending-partner");
  });

  it("leaves non-member items out of the result", () => {
    const other = makeProduct({ uuid: "u4", product_id: "unknown", values: red });
    const statuses = allocateSetDiscounts([nest("u1"), blanket("u3"), other], groups);
    expect(statuses.has("u4")).toBe(false);
    expect(statuses.get("u1")?.state).toBe("active");
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
    expect(price.totalPrice).toBe(19_000);
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
