/**
 * Set (product-group) discount resolution.
 *
 * Covers subset material matching (`materialsMatch`) and basket-level set
 * allocation: `computeSetAllocation` forms one *maximal* instance per matching
 * group (one unit each of every mutually compatible distinct member), repeats
 * while at least two distinct members still have units, and consumes each
 * basket unit at most once. `resolveSetInstances` exposes the formed instances,
 * `resolveSetCoverage` each line's per-set unit coverage (for pricing), and
 * `allocateSetDiscounts` / `resolveSetDiscountStatus` the per-item UI status.
 * See the `product-sets` spec in `openspec/`.
 */
import { describe, expect, it } from "vitest";
import {
  materialsMatch,
  resolveSetDiscount,
  resolveSetDiscountStatus,
  resolveSetInstances,
  resolveSetCoverage,
  allocateSetDiscounts,
  canSyncMaterials,
  calculatePriceForItem,
  type SetDiscountGroup,
} from "@/lib/priceUtils";
import type { IProduct, ProductMaterialValue } from "@/lib/types.svelte";
import { makeProduct, makeMaterial, makeField } from "./fixtures";

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

  it("matches when one selection is a subset of the other (different counts)", () => {
    // A one-fabric blanket matches a two-fabric nest that shares that fabric.
    const nest = makeProduct({ values: [val("cotton", ["red"]), val("wool", ["green"])] });
    const blanket = makeProduct({ values: [val("cotton", ["red"])] });
    expect(materialsMatch(nest, blanket)).toBe(true);
    expect(materialsMatch(blanket, nest)).toBe(true);
  });

  it("does not match when the shared material differs, even as a subset", () => {
    const nest = makeProduct({ values: [val("cotton", ["red"]), val("wool", ["green"])] });
    const blanket = makeProduct({ values: [val("cotton", ["blue"])] });
    expect(materialsMatch(nest, blanket)).toBe(false);
  });

  it("keeps the same fabric in two colours as distinct selections", () => {
    // A nest using one fabric in two colours must not collapse to a single
    // entry: a blanket that shares one of those colours is still a subset.
    const nest = makeProduct({ values: [val("teddy", ["feher"]), val("teddy", ["ekru"])] });
    const blanket = makeProduct({ values: [val("teddy", ["feher"])] });
    expect(materialsMatch(nest, blanket)).toBe(true);
    expect(materialsMatch(blanket, nest)).toBe(true);
  });

  it("requires an exact match when material counts are equal", () => {
    // Both pick two fabrics: subset matching is not allowed, so a feher+ekru
    // nest does not match a feher+feher blanket, but feher+feher does.
    const nestMixed = makeProduct({ values: [val("teddy", ["feher"]), val("teddy", ["ekru"])] });
    const nestFeher = makeProduct({ values: [val("teddy", ["feher"]), val("teddy", ["feher"])] });
    const blanket = makeProduct({ values: [val("teddy", ["feher"]), val("teddy", ["feher"])] });
    expect(materialsMatch(nestMixed, blanket)).toBe(false);
    expect(materialsMatch(nestFeher, blanket)).toBe(true);
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

const red = [val("cotton", ["red"])];
const nest = (uuid: string, count = 1): IProduct =>
  makeProduct({ uuid, product_id: "nest", count, values: red });
const blanket = (uuid: string, count = 1): IProduct =>
  makeProduct({ uuid, product_id: "blanket", count, values: red });

describe("resolveSetDiscount (potential)", () => {
  it("returns the biggest set discount regardless of the basket", () => {
    expect(resolveSetDiscount("blanket", groups)?.percent).toBe(10);
    expect(resolveSetDiscount("unknown", groups)).toBeUndefined();
  });

  it("picks the biggest set when a product is in several", () => {
    const multi: SetDiscountGroup[] = [
      { title: "Small", discount_percent: 5, products: [{ product_id: "nest" }] },
      { title: "Big", discount_percent: 20, products: [{ product_id: "nest" }] },
    ];
    expect(resolveSetDiscount("nest", multi)).toEqual({ percent: 20, setTitle: "Big" });
  });
});

describe("resolveSetInstances", () => {
  it("forms nothing for a single item", () => {
    expect(resolveSetInstances([nest("u1")], groups)).toEqual([]);
  });

  it("forms one instance per matching pair", () => {
    expect(resolveSetInstances([nest("u1"), blanket("u3")], groups)).toEqual([
      { setTitle: "Babafészek szett", percent: 10, members: ["u1", "u3"] },
    ]);
  });

  it("does not form an instance when materials differ", () => {
    const a = makeProduct({ uuid: "u1", product_id: "nest", values: [val("cotton", ["red"])] });
    const b = makeProduct({ uuid: "u2", product_id: "blanket", values: [val("cotton", ["blue"])] });
    expect(resolveSetInstances([a, b], groups)).toEqual([]);
  });

  it("forms a maximal instance across three distinct members, then repeats on leftovers", () => {
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
    expect(resolveSetInstances([a, b, c], trio)).toEqual([
      { setTitle: "Trio", percent: 20, members: ["u1", "u2", "u3"] },
      { setTitle: "Trio", percent: 20, members: ["u1", "u3"] },
    ]);
  });

  it("groups three distinct members into a single instance (leftover units unused)", () => {
    // nest + nest2 + blanket-with-2-units: one maximal instance of three; the
    // second blanket unit has no remaining partners, so it earns nothing.
    const trioGroups: SetDiscountGroup[] = [
      {
        title: "Babafészek szett",
        discount_percent: 10,
        products: [{ product_id: "nest" }, { product_id: "nest2" }, { product_id: "blanket" }],
      },
    ];
    const nestA = makeProduct({ uuid: "u1", product_id: "nest", values: red });
    const nestB = makeProduct({ uuid: "u2", product_id: "nest2", values: red });
    const blanketC = makeProduct({ uuid: "u3", product_id: "blanket", count: 2, values: red });
    expect(resolveSetInstances([nestA, nestB, blanketC], trioGroups)).toEqual([
      { setTitle: "Babafészek szett", percent: 10, members: ["u1", "u2", "u3"] },
    ]);
  });

  it("discounts the most valuable line when a member has interchangeable units", () => {
    // One nest, two blanket lines that both match the nest but differ in price
    // (the pricier carries an add-on). Only one instance can form, so it must
    // fall on the more expensive blanket to maximise the discount, regardless of
    // basket order.
    const cheap = makeProduct({ uuid: "cheap", product_id: "blanket", price: 7500, values: red });
    const pricey = makeProduct({
      uuid: "pricey",
      product_id: "blanket",
      price: 7500,
      values: red,
      fields: [
        makeField({
          name: "himzes",
          type: "embroidery",
          price: 1500,
          value: { enabled: true, text: { value: "hello" }, color: { color: "babakek" } },
        }),
      ],
    });
    const onlyNest = makeProduct({ uuid: "nest", product_id: "nest", price: 15_000, values: red });
    expect(resolveSetInstances([cheap, pricey, onlyNest], groups)).toEqual([
      { setTitle: "Babafészek szett", percent: 10, members: ["pricey", "nest"] },
    ]);
  });

  it("prefers a material-matching partner over a pricier incompatible one", () => {
    // Two nests match a blanket only when materials pair exactly: the pricier
    // nest (feher+ekru) does not match the feher+feher blanket, so the set must
    // form with the cheaper feher+feher nest rather than fail to form.
    const feher = [val("teddy", ["feher"]), val("teddy", ["feher"])];
    const mixed = [val("teddy", ["feher"]), val("teddy", ["ekru"])];
    const nestPricey = makeProduct({
      uuid: "nestPricey",
      product_id: "nest",
      price: 20_000,
      values: mixed,
    });
    const nestMatch = makeProduct({
      uuid: "nestMatch",
      product_id: "nest",
      price: 15_000,
      values: feher,
    });
    const blanketLine = makeProduct({
      uuid: "blanket",
      product_id: "blanket",
      price: 8000,
      values: feher,
    });
    expect(resolveSetInstances([nestPricey, nestMatch, blanketLine], groups)).toEqual([
      { setTitle: "Babafészek szett", percent: 10, members: ["nestMatch", "blanket"] },
    ]);
  });
});

describe("resolveSetCoverage", () => {
  it("has no entry for lines earning no set discount", () => {
    expect(resolveSetCoverage([nest("u1")], groups).get("u1")).toBeUndefined();
  });

  it("reports covered units per line", () => {
    const coverage = resolveSetCoverage([nest("u1", 2), blanket("u3", 2)], groups);
    expect(coverage.get("u1")).toEqual([{ setTitle: "Babafészek szett", percent: 10, count: 2 }]);
    expect(coverage.get("u3")).toEqual([{ setTitle: "Babafészek szett", percent: 10, count: 2 }]);
  });

  it("splits a line's units across sets at different percents", () => {
    // A nest belongs to a 20% set (with pillow) and a 10% set (with blanket).
    // With one pillow and one blanket present, its two units land in both.
    const mixed: SetDiscountGroup[] = [
      {
        title: "Big set",
        discount_percent: 20,
        products: [{ product_id: "nest" }, { product_id: "pillow" }],
      },
      groups[0],
    ];
    const nestLine = makeProduct({ uuid: "u1", product_id: "nest", count: 2, values: red });
    const pillow = makeProduct({ uuid: "u2", product_id: "pillow", values: red });
    const blanketLine = makeProduct({ uuid: "u3", product_id: "blanket", values: red });
    const coverage = resolveSetCoverage([nestLine, pillow, blanketLine], mixed);
    expect(coverage.get("u1")).toEqual([
      { setTitle: "Big set", percent: 20, count: 1 },
      { setTitle: "Babafészek szett", percent: 10, count: 1 },
    ]);
    expect(coverage.get("u2")).toEqual([{ setTitle: "Big set", percent: 20, count: 1 }]);
    expect(coverage.get("u3")).toEqual([{ setTitle: "Babafészek szett", percent: 10, count: 1 }]);
  });
});

describe("allocateSetDiscounts (per-item status)", () => {
  it("allocates each partner unit at most once across the basket", () => {
    // Two nest lines + one blanket line = exactly one set, not two.
    const statuses = allocateSetDiscounts([nest("u1"), nest("u2"), blanket("u3")], groups);
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

  it("covers lines greedily in basket order, leaving later lines pending", () => {
    const statuses = allocateSetDiscounts([nest("u1", 2), nest("u2", 2), blanket("u3", 2)], groups);
    expect(statuses.get("u1")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
    expect(statuses.get("u2")).toEqual({
      state: "pending-partner",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
  });

  it("pairs across three products up to the maximum feasible units", () => {
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
      count: 2,
    });
  });

  it("breaks pairing ties by basket order", () => {
    expect(
      allocateSetDiscounts([nest("u1"), nest("u2"), blanket("u3")], groups).get("u1")?.state
    ).toBe("active");
    expect(
      allocateSetDiscounts([blanket("u3"), nest("u2"), nest("u1")], groups).get("u1")?.state
    ).toBe("pending-partner");
  });

  it("leaves non-member items out of the result", () => {
    const other = makeProduct({ uuid: "u4", product_id: "unknown", values: red });
    const statuses = allocateSetDiscounts([nest("u1"), blanket("u3"), other], groups);
    expect(statuses.has("u4")).toBe(false);
    expect(statuses.get("u1")?.state).toBe("active");
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
    const pillow = makeProduct({ uuid: "u3", product_id: "pillow", values: red });
    const statuses = allocateSetDiscounts([nest("u1"), blanket("u2"), pillow], multiGroups);
    expect(statuses.get("u1")?.percent).toBe(20);
  });
});

describe("resolveSetDiscountStatus", () => {
  it("returns undefined when the item earns no set discount", () => {
    const other = makeProduct({ uuid: "u1", product_id: "unknown" });
    expect(resolveSetDiscountStatus(other, [other], groups)).toBeUndefined();
  });

  it("reports pending-partner when no set sibling is in the basket", () => {
    expect(resolveSetDiscountStatus(nest("u1"), [nest("u1")], groups)).toEqual({
      state: "pending-partner",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("does not count a second line of the same product as a set partner", () => {
    const nestA = nest("u1");
    const nestB = nest("u2");
    expect(resolveSetDiscountStatus(nestA, [nestA, nestB], groups)?.state).toBe("pending-partner");
  });

  it("reports active when a matching-material sibling is present", () => {
    const nestA = nest("u1");
    const blanketB = blanket("u2");
    expect(resolveSetDiscountStatus(nestA, [nestA, blanketB], groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("caps the active count to the available partner units", () => {
    const nestA = nest("u1", 2);
    const blanketB = blanket("u2", 1);
    expect(resolveSetDiscountStatus(nestA, [nestA, blanketB], groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("sums the counts of multiple matching partner lines", () => {
    // Two distinct blanket lines (different embroidery, same materials) cover
    // two nests even though no single line has count 2.
    const nestA = nest("u1", 2);
    const blanketA = blanket("u2", 1);
    const blanketB = blanket("u3", 1);
    expect(resolveSetDiscountStatus(nestA, [nestA, blanketA, blanketB], groups)).toEqual({
      state: "active",
      percent: 10,
      setTitle: "Babafészek szett",
      count: 2,
    });
  });

  it("still caps the summed partner count at the item's own count", () => {
    const nestA = nest("u1", 1);
    const blanketA = blanket("u2", 1);
    const blanketB = blanket("u3", 1);
    expect(resolveSetDiscountStatus(nestA, [nestA, blanketA, blanketB], groups)?.count).toBe(1);
  });

  it("reports pending-material with a syncable partner when materials differ", () => {
    const nestA = makeProduct({
      uuid: "u1",
      product_id: "nest",
      values: [val("cotton", ["red"])],
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    const blanketB = makeProduct({
      uuid: "u2",
      product_id: "blanket",
      values: [val("cotton", ["blue"])],
      materials: [makeMaterial({ material_id: "cotton" })],
      material_required_count: 1,
    });
    expect(resolveSetDiscountStatus(nestA, [nestA, blanketB], groups)).toEqual({
      state: "pending-material",
      percent: 10,
      setTitle: "Babafészek szett",
      partnerUuid: "u2",
      canSync: true,
      count: 1,
    });
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

describe("calculatePriceForItem with set coverage", () => {
  it("applies the set discount and marks the source", () => {
    const product = makeProduct({ price: 10_000, count: 1 });
    const price = calculatePriceForItem(product, [
      { setTitle: "Babafészek szett", percent: 10, count: 1 },
    ]);
    expect(price.totalPrice).toBe(9000);
    expect(price.discountInfo?.discountSource).toBe("set");
    expect(price.discountInfo?.discountAppliedCount).toBe(1);
  });

  it("applies the set discount only to the covered units of a larger quantity", () => {
    // 2 units in the line, but coverage is 1 → discount on 1 of 2.
    const product = makeProduct({ price: 10_000, count: 2 });
    const price = calculatePriceForItem(product, [
      { setTitle: "Babafészek szett", percent: 10, count: 1 },
    ]);
    // per-line factor = 1 - 10%*1/2 = 0.95, so total = 20000 * 0.95 = 19000
    expect(price.totalPrice).toBe(19_000);
    expect(price.discountInfo?.discountAppliedCount).toBe(1);
  });

  it("blends units covered by different sets at different percents", () => {
    const product = makeProduct({ price: 10_000, count: 2 });
    const price = calculatePriceForItem(product, [
      { setTitle: "Big set", percent: 20, count: 1 },
      { setTitle: "Babafészek szett", percent: 10, count: 1 },
    ]);
    // percentUnits = 20 + 10 = 30 → factor = 1 - 30/100/2 = 0.85
    expect(price.totalPrice).toBe(17_000);
    expect(price.discountInfo?.discountAppliedCount).toBe(2);
    expect(price.discountInfo?.percent).toBe(20);
  });

  it("lets set coverage replace a standalone discount even when expired", () => {
    const product = makeProduct({
      price: 10_000,
      count: 1,
      discount: 50,
      discount_valid_until: "2000-01-01",
    });
    const price = calculatePriceForItem(product, [
      { setTitle: "Babafészek szett", percent: 10, count: 1 },
    ]);
    expect(price.totalPrice).toBe(9000);
    expect(price.discountInfo?.discountSource).toBe("set");
  });

  it("falls back to no discount without coverage", () => {
    const product = makeProduct({ price: 10_000, count: 1 });
    expect(calculatePriceForItem(product).discountInfo).toBeUndefined();
  });
});
