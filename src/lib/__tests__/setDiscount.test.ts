/**
 * Set (product-group) discount resolution.
 *
 * Covers subset material matching (`materialsMatch`) and basket-level set
 * allocation: `computeSetAllocation` forms one *maximal* instance per matching
 * group (one unit each of every mutually compatible distinct member), repeats
 * while at least two distinct members still have units, and consumes each
 * basket unit at most once. `resolveSetInstances` exposes the formed instances
 * (each carrying its flat forint discount), `setInstanceAmount` the forint a
 * formed instance actually removes (clamped to the covered subtotal), and
 * `allocateSetDiscounts` / `resolveSetDiscountStatus` the per-item UI status.
 * See the `product-sets` spec in `docs/specs/product-sets.md`.
 */
import { describe, expect, it } from "vitest";
import {
  materialsMatch,
  resolveSetDiscount,
  resolveSetDiscountStatus,
  resolveSetInstances,
  allocateSetDiscounts,
  setInstanceAmount,
  canSyncMaterials,
  type SetDiscountGroup,
  type SetDiscountInstance,
} from "@/lib/pricing/setDiscount";
import type { IProduct, ProductMaterialValue } from "@/lib/types.svelte";
import { makeProduct, makeMaterial, makeField } from "./fixtures";

const val = (material_id: string, colors: string[]): ProductMaterialValue => ({
  material_id,
  colors,
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

  it("matches two products with no material selections", () => {
    expect(materialsMatch(makeProduct(), makeProduct())).toBe(true);
  });
});

const groups: SetDiscountGroup[] = [
  {
    title: "Babafészek szett",
    discount_amount: 1000,
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
    expect(resolveSetDiscount("blanket", groups)?.amount).toBe(1000);
    expect(resolveSetDiscount("unknown", groups)).toBeUndefined();
  });

  it("picks the biggest-amount set when a product is in several", () => {
    const multi: SetDiscountGroup[] = [
      { title: "Small", discount_amount: 500, products: [{ product_id: "nest" }] },
      { title: "Big", discount_amount: 2000, products: [{ product_id: "nest" }] },
    ];
    expect(resolveSetDiscount("nest", multi)).toEqual({ amount: 2000, setTitle: "Big" });
  });

  it("ignores a group with a zero or absent discount", () => {
    const noDiscount: SetDiscountGroup[] = [
      { title: "Related", discount_amount: 0, products: [{ product_id: "nest" }] },
      { title: "Related2", products: [{ product_id: "nest" }] },
    ];
    expect(resolveSetDiscount("nest", noDiscount)).toBeUndefined();
  });
});

describe("resolveSetInstances", () => {
  it("forms nothing for a single item", () => {
    expect(resolveSetInstances([nest("u1")], groups)).toEqual([]);
  });

  it("forms one instance per matching pair, carrying the set's flat amount", () => {
    expect(resolveSetInstances([nest("u1"), blanket("u3")], groups)).toEqual([
      { setTitle: "Babafészek szett", amount: 1000, members: ["u1", "u3"] },
    ]);
  });

  it("forms nothing for a zero-discount group", () => {
    const related: SetDiscountGroup[] = [
      {
        title: "Kapcsolódó",
        discount_amount: 0,
        products: [{ product_id: "nest" }, { product_id: "blanket" }],
      },
    ];
    expect(resolveSetInstances([nest("u1"), blanket("u3")], related)).toEqual([]);
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
        discount_amount: 2000,
        products: [{ product_id: "a" }, { product_id: "b" }, { product_id: "c" }],
      },
    ];
    const a = makeProduct({ uuid: "u1", product_id: "a", count: 2, values: red });
    const b = makeProduct({ uuid: "u2", product_id: "b", values: red });
    const c = makeProduct({ uuid: "u3", product_id: "c", count: 2, values: red });
    expect(resolveSetInstances([a, b, c], trio)).toEqual([
      { setTitle: "Trio", amount: 2000, members: ["u1", "u2", "u3"] },
      { setTitle: "Trio", amount: 2000, members: ["u1", "u3"] },
    ]);
  });

  it("allocates the biggest-amount set first per unit", () => {
    // A nest belongs to a 2000 Ft set (with pillow) and a 1000 Ft set (with
    // blanket). With one pillow and one blanket present, its two units land in
    // both, biggest amount first.
    const mixed: SetDiscountGroup[] = [
      {
        title: "Big set",
        discount_amount: 2000,
        products: [{ product_id: "nest" }, { product_id: "pillow" }],
      },
      groups[0],
    ];
    const nestLine = makeProduct({ uuid: "u1", product_id: "nest", count: 2, values: red });
    const pillow = makeProduct({ uuid: "u2", product_id: "pillow", values: red });
    const blanketLine = makeProduct({ uuid: "u3", product_id: "blanket", values: red });
    expect(resolveSetInstances([nestLine, pillow, blanketLine], mixed)).toEqual([
      { setTitle: "Big set", amount: 2000, members: ["u1", "u2"] },
      { setTitle: "Babafészek szett", amount: 1000, members: ["u1", "u3"] },
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
      { setTitle: "Babafészek szett", amount: 1000, members: ["pricey", "nest"] },
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
      { setTitle: "Babafészek szett", amount: 1000, members: ["nestMatch", "blanket"] },
    ]);
  });
});

describe("setInstanceAmount", () => {
  const instance = (amount: number, members: string[]): SetDiscountInstance => ({
    setTitle: "Babafészek szett",
    amount,
    members,
  });

  it("removes the flat set amount when the covered subtotal exceeds it", () => {
    const basket = [
      makeProduct({ uuid: "u1", price: 10_000 }),
      makeProduct({ uuid: "u2", price: 10_000 }),
    ];
    expect(setInstanceAmount(instance(1000, ["u1", "u2"]), basket)).toEqual({
      amount: 1000,
      nominal: 1000,
    });
  });

  it("clamps the deduction to the covered units' subtotal", () => {
    // Two cheap members total 500 Ft; a 1000 Ft set can only take 500 off.
    const basket = [
      makeProduct({ uuid: "u1", price: 300 }),
      makeProduct({ uuid: "u2", price: 200 }),
    ];
    expect(setInstanceAmount(instance(1000, ["u1", "u2"]), basket)).toEqual({
      amount: 500,
      nominal: 1000,
    });
  });

  it("clamps against the subtotal after standalone discounts", () => {
    // One member is half price via a valid standalone discount, so the covered
    // subtotal is 5000 + 10000 = 15000; a 20000 Ft set is clamped to that.
    const basket = [
      makeProduct({
        uuid: "u1",
        price: 10_000,
        discount: 50,
        discount_valid_until: "2999-01-01",
      }),
      makeProduct({ uuid: "u2", price: 10_000 }),
    ];
    expect(setInstanceAmount(instance(20_000, ["u1", "u2"]), basket)).toEqual({
      amount: 15_000,
      nominal: 20_000,
    });
  });

  it("takes the flat amount off the discounted subtotal when it still fits", () => {
    const basket = [
      makeProduct({
        uuid: "u1",
        price: 10_000,
        discount: 50,
        discount_valid_until: "2999-01-01",
      }),
      makeProduct({ uuid: "u2", price: 10_000 }),
    ];
    expect(setInstanceAmount(instance(1000, ["u1", "u2"]), basket)).toEqual({
      amount: 1000,
      nominal: 1000,
    });
  });
});

describe("allocateSetDiscounts (per-item status)", () => {
  it("allocates each partner unit at most once across the basket", () => {
    // Two nest lines + one blanket line = exactly one set, not two.
    const statuses = allocateSetDiscounts([nest("u1"), nest("u2"), blanket("u3")], groups);
    expect(statuses.get("u1")).toEqual({
      state: "active",
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u2")).toEqual({
      state: "pending-partner",
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("covers only as many units of a line as the partner has units", () => {
    const statuses = allocateSetDiscounts([nest("u1", 2), blanket("u3")], groups);
    expect(statuses.get("u1")).toEqual({
      state: "active",
      setTitle: "Babafészek szett",
      count: 1,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("covers lines greedily in basket order, leaving later lines pending", () => {
    const statuses = allocateSetDiscounts([nest("u1", 2), nest("u2", 2), blanket("u3", 2)], groups);
    expect(statuses.get("u1")).toEqual({
      state: "active",
      setTitle: "Babafészek szett",
      count: 2,
    });
    expect(statuses.get("u2")).toEqual({
      state: "pending-partner",
      setTitle: "Babafészek szett",
      count: 2,
    });
    expect(statuses.get("u3")).toEqual({
      state: "active",
      setTitle: "Babafészek szett",
      count: 2,
    });
  });

  it("pairs across three products up to the maximum feasible units", () => {
    const trio: SetDiscountGroup[] = [
      {
        title: "Trio",
        discount_amount: 2000,
        products: [{ product_id: "a" }, { product_id: "b" }, { product_id: "c" }],
      },
    ];
    const a = makeProduct({ uuid: "u1", product_id: "a", count: 2, values: red });
    const b = makeProduct({ uuid: "u2", product_id: "b", values: red });
    const c = makeProduct({ uuid: "u3", product_id: "c", count: 2, values: red });
    const statuses = allocateSetDiscounts([a, b, c], trio);
    expect(statuses.get("u1")).toEqual({ state: "active", setTitle: "Trio", count: 2 });
    expect(statuses.get("u2")).toEqual({ state: "active", setTitle: "Trio", count: 1 });
    expect(statuses.get("u3")).toEqual({ state: "active", setTitle: "Trio", count: 2 });
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

  it("reports the biggest-amount set across active sets", () => {
    const multiGroups: SetDiscountGroup[] = [
      {
        title: "Small set",
        discount_amount: 500,
        products: [{ product_id: "nest" }, { product_id: "blanket" }],
      },
      {
        title: "Big set",
        discount_amount: 2000,
        products: [{ product_id: "nest" }, { product_id: "pillow" }],
      },
    ];
    const pillow = makeProduct({ uuid: "u3", product_id: "pillow", values: red });
    const statuses = allocateSetDiscounts([nest("u1"), blanket("u2"), pillow], multiGroups);
    expect(statuses.get("u1")?.setTitle).toBe("Big set");
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
      setTitle: "Babafészek szett",
      count: 1,
    });
  });

  it("caps the active count to the available partner units", () => {
    const nestA = nest("u1", 2);
    const blanketB = blanket("u2", 1);
    expect(resolveSetDiscountStatus(nestA, [nestA, blanketB], groups)).toEqual({
      state: "active",
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
      setTitle: "Babafészek szett",
      partnerUuid: "u2",
      canSync: true,
      count: 1,
    });
  });

  it("does not offer a material sync against a partner already consumed by a set", () => {
    // A feher blanket forms a set with a feher nest, consuming the only blanket.
    // A second feher+ekru nest must not be nudged to sync its materials to that
    // blanket — there are no free blanket units left to form another set.
    const nestFeher = makeProduct({
      uuid: "u1",
      product_id: "nest",
      values: [val("teddy", ["feher"]), val("teddy", ["feher"])],
    });
    const nestMixed = makeProduct({
      uuid: "u2",
      product_id: "nest",
      values: [val("teddy", ["feher"]), val("teddy", ["ekru"])],
    });
    const blanketFeher = makeProduct({
      uuid: "u3",
      product_id: "blanket",
      values: [val("teddy", ["feher"]), val("teddy", ["feher"])],
    });
    const basket = [nestFeher, nestMixed, blanketFeher];
    expect(resolveSetDiscountStatus(nestFeher, basket, groups)?.state).toBe("active");
    expect(resolveSetDiscountStatus(nestMixed, basket, groups)).toEqual({
      state: "pending-partner",
      setTitle: "Babafészek szett",
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
