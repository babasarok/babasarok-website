import { ProductDefinitionSchema } from "@babasarok/product-definition";
import type { PromotionWindow } from "./active-promotions";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_SET_CONDITION_CODE,
  memberIds,
  relevantNativeProductIds,
  setBasketState,
  setGroups,
  type BasketLine,
  type DefinitionRow,
  type SetCollection,
} from "./set-basket";

function filterOf(value?: string): SetCollection["filters"] {
  return [
    {
      code: "product-id-filter",
      args: value === undefined ? [] : [{ name: "productIds", value }],
    },
  ];
}

function collection(
  overrides: Partial<SetCollection> & { slug?: string; name?: string } = {}
): SetCollection {
  return {
    translations: [
      { languageCode: "hu", name: overrides.name ?? "Szett", slug: overrides.slug ?? "szett" },
    ],
    filters: filterOf('["1","2"]'),
    customFields: { setDiscount: 1000 },
    ...overrides,
  };
}

const productIdByNativeId = new Map([
  [1, "parna"],
  [2, "pelenka"],
  [3, "kendo"],
]);

describe("memberIds", () => {
  it("parses string and numeric ids from the product-id-filter", () => {
    expect(memberIds(filterOf('["1",2]'))).toEqual(["1", "2"]);
  });

  it("is undefined without the filter, the argument, or with unusable values", () => {
    expect(memberIds([])).toBeUndefined();
    expect(memberIds([{ code: "other", args: [] }])).toBeUndefined();
    expect(memberIds(filterOf())).toBeUndefined();
    expect(memberIds(filterOf("nem json"))).toBeUndefined();
    expect(memberIds(filterOf('{"a":1}'))).toBeUndefined();
    expect(memberIds(filterOf("[1,null]"))).toBeUndefined();
  });
});

describe("setGroups", () => {
  it("builds a group from slug, name, discount and known members", () => {
    expect(setGroups([collection()], productIdByNativeId)).toEqual([
      { groupId: "szett", label: "Szett", discount: 1000, productIds: ["parna", "pelenka"] },
    ]);
  });

  it("drops members without a generated definition", () => {
    const groups = setGroups(
      [collection({ filters: filterOf('["1","2","99"]') })],
      productIdByNativeId
    );

    expect(groups[0]?.productIds).toEqual(["parna", "pelenka"]);
  });

  it("ignores degenerate groups", () => {
    const degenerate = [
      collection({ customFields: { setDiscount: null } }),
      collection({ customFields: { setDiscount: 0 } }),
      collection({ filters: filterOf('["1"]') }),
      collection({ filters: filterOf('["1","99"]') }),
      collection({ filters: [] }),
      collection({ translations: [{ languageCode: "en", name: "Set", slug: "set" }] }),
    ];

    expect(setGroups(degenerate, productIdByNativeId)).toEqual([]);
  });

  it("keeps valid siblings of an ignored group", () => {
    const groups = setGroups(
      [collection({ customFields: { setDiscount: null } }), collection({ slug: "masik" })],
      productIdByNativeId
    );

    expect(groups.map((group) => group.groupId)).toEqual(["masik"]);
  });
});

function definitionRow(nativeProductId: number, id: string): DefinitionRow {
  return {
    nativeProductId,
    definition: ProductDefinitionSchema.parse({
      id,
      orderable: true,
      basePrice: 5000,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [],
    }),
  };
}

function line(id: number, nativeProductId: number, quantity = 1): BasketLine {
  return { id, quantity, listPrice: 5000, nativeProductId, selectionsRaw: null, options: [] };
}

const rows = [definitionRow(1, "parna"), definitionRow(2, "pelenka")];

function promotion(
  overrides: { deletedAt?: Date | null; channelId?: number } = {}
): PromotionWindow {
  return {
    deletedAt: overrides.deletedAt ?? null,
    startsAt: null,
    endsAt: null,
    channels: [{ id: overrides.channelId ?? 1 }],
    conditions: [{ code: PRODUCT_SET_CONDITION_CODE }],
  };
}

function evaluate(
  promotions: PromotionWindow[],
  lines: BasketLine[]
): ReturnType<typeof setBasketState> {
  return setBasketState({
    promotions,
    channelId: 1,
    now: new Date(),
    children: [collection()],
    lines,
    definitionRows: rows,
  });
}

describe("relevantNativeProductIds", () => {
  it("unions basket products with set members", () => {
    expect(
      relevantNativeProductIds([line(1, 7)], [collection()]).toSorted((a, b) => a - b)
    ).toEqual([1, 2, 7]);
  });
});

describe("setBasketState", () => {
  it("forms one instance from a complete set and totals its discount", () => {
    const state = evaluate([promotion()], [line(10, 1), line(11, 2)]);

    expect(state.total).toBe(1000);
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0]?.groupId).toBe("szett");
  });

  it("stays silent when no set forms", () => {
    expect(evaluate([promotion()], [line(10, 1, 3)]).instances).toEqual([]);
    expect(evaluate([promotion()], [line(10, 5), line(11, 6)]).instances).toEqual([]);
  });

  it("refuses when two active promotions use the condition", () => {
    const lines = [line(10, 1), line(11, 2)];

    expect(evaluate([promotion(), promotion()], lines).instances).toEqual([]);
  });

  it("is empty without an active promotion", () => {
    expect(evaluate([], [line(10, 1), line(11, 2)]).instances).toEqual([]);
  });

  it("does not count deleted or other-channel promotions", () => {
    const lines = [line(10, 1), line(11, 2)];
    const others = [promotion({ deletedAt: new Date() }), promotion({ channelId: 2 })];

    expect(evaluate([promotion(), ...others], lines).total).toBe(1000);
  });
});
