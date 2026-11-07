import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import { describe, expect, it } from "vitest";
import {
  activePromotions,
  amountFromArgs,
  memberIds,
  memberIdsFromArgs,
  overlappingMemberIds,
  promotionGroups,
  relevantNativeProductIds,
  setBasketState,
  type BasketLine,
  type DefinitionRow,
  type PromotionSource,
  type PromotionWindow,
} from "./set-basket";

function source(overrides: Partial<PromotionSource> = {}): PromotionSource {
  return {
    id: overrides.id ?? "1",
    label: overrides.label ?? "Szett",
    memberIds: overrides.memberIds ?? ["1", "2"],
    amount: overrides.amount === undefined ? 1000 : overrides.amount,
  };
}

describe("memberIds (related collections)", () => {
  it("parses string and numeric ids from the product-id-filter", () => {
    expect(
      memberIds([{ code: "product-id-filter", args: [{ name: "productIds", value: '["1",2]' }] }])
    ).toEqual(["1", "2"]);
  });

  it("is undefined without the filter, the argument, or with unusable values", () => {
    expect(memberIds([])).toBeUndefined();
    expect(memberIds([{ code: "other", args: [] }])).toBeUndefined();
    expect(memberIds([{ code: "product-id-filter", args: [] }])).toBeUndefined();
    expect(
      memberIds([{ code: "product-id-filter", args: [{ name: "productIds", value: "nem json" }] }])
    ).toBeUndefined();
    expect(
      memberIds([{ code: "product-id-filter", args: [{ name: "productIds", value: '{"a":1}' }] }])
    ).toBeUndefined();
    expect(
      memberIds([{ code: "product-id-filter", args: [{ name: "productIds", value: "[1,null]" }] }])
    ).toBeUndefined();
  });
});

describe("promotion arg parsing", () => {
  it("parses member ids and amounts", () => {
    expect(memberIdsFromArgs([{ name: "productIds", value: "[1,2]" }])).toEqual(["1", "2"]);
    expect(amountFromArgs([{ name: "amount", value: "1500" }])).toBe(1500);
  });

  it("rejects unusable args", () => {
    expect(memberIdsFromArgs([{ name: "productIds", value: "nem json" }])).toBeUndefined();
    expect(amountFromArgs([{ name: "amount", value: "0" }])).toBeNull();
    expect(amountFromArgs([{ name: "amount", value: "-5" }])).toBeNull();
  });
});

describe("promotionGroups", () => {
  const productIdByNativeId = new Map([
    [1, "parna"],
    [2, "pelenka"],
    [3, "kendo"],
  ]);

  it("builds a group from label, amount and known members", () => {
    expect(promotionGroups([source()], productIdByNativeId)).toEqual([
      { groupId: "1", label: "Szett", discount: 1000, productIds: ["parna", "pelenka"] },
    ]);
  });

  it("drops members without a generated definition", () => {
    const groups = promotionGroups([source({ memberIds: ["1", "2", "99"] })], productIdByNativeId);

    expect(groups[0]?.productIds).toEqual(["parna", "pelenka"]);
  });

  it("ignores degenerate groups", () => {
    const degenerate = [
      source({ amount: null }),
      source({ amount: 0 }),
      source({ memberIds: ["1"] }),
      source({ memberIds: ["1", "99"] }),
    ];

    expect(promotionGroups(degenerate, productIdByNativeId)).toEqual([]);
  });

  it("keeps valid siblings of an ignored group", () => {
    const groups = promotionGroups(
      [source({ amount: null }), source({ id: "2", label: "Masik" })],
      productIdByNativeId
    );

    expect(groups.map((group) => group.groupId)).toEqual(["2"]);
  });
});

describe("overlappingMemberIds", () => {
  it("flags products listed by two promotions", () => {
    expect([
      ...overlappingMemberIds([
        source({ memberIds: ["1", "2"] }),
        source({ memberIds: ["2", "3"] }),
      ]),
    ]).toEqual(["2"]);
    expect(overlappingMemberIds([source(), source({ memberIds: ["3", "4"] })]).size).toBe(0);
  });
});

describe("activePromotions", () => {
  const now = new Date("2026-11-07T10:00:00Z");

  function windowOf(overrides: {
    deletedAt?: Date | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    channelId?: number;
  }): PromotionWindow {
    return {
      deletedAt: overrides.deletedAt ?? null,
      startsAt: overrides.startsAt ?? null,
      endsAt: overrides.endsAt ?? null,
      channels: [{ id: overrides.channelId ?? 1 }],
      conditions: [],
      actions: [],
    };
  }

  it("keeps live promotions on the channel", () => {
    const windows = [
      windowOf({}),
      windowOf({ deletedAt: new Date() }),
      windowOf({ channelId: 2 }),
      windowOf({ startsAt: new Date("2026-11-08") }),
      windowOf({ endsAt: new Date("2026-11-06") }),
    ];

    expect(activePromotions(windows, 1, now)).toHaveLength(1);
  });
});

function definitionRow(nativeProductId: number, id: string): DefinitionRow {
  return {
    nativeProductId,
    definition: ProductDefinitionSchema.parse({
      id,
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

describe("relevantNativeProductIds", () => {
  it("unions basket products with set members", () => {
    expect(
      relevantNativeProductIds([line(1, 7)], [source({ memberIds: ["1", "2"] })]).toSorted(
        (a, b) => a - b
      )
    ).toEqual([1, 2, 7]);
  });
});

function evaluate(
  sources: PromotionSource[],
  lines: BasketLine[]
): ReturnType<typeof setBasketState> {
  return setBasketState({ sources, lines, definitionRows: rows });
}

describe("setBasketState", () => {
  it("forms one instance from a complete set and totals its discount", () => {
    const state = evaluate([source()], [line(10, 1), line(11, 2)]);

    expect(state.total).toBe(1000);
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0]?.groupId).toBe("1");
  });

  it("stays silent when no set forms", () => {
    expect(evaluate([source()], [line(10, 1, 3)]).instances).toEqual([]);
    expect(evaluate([source()], [line(10, 5), line(11, 6)]).instances).toEqual([]);
  });

  it("refuses when two active promotions list the same product", () => {
    const lines = [line(10, 1), line(11, 2)];

    expect(
      evaluate([source(), source({ id: "2", memberIds: ["2", "3"] })], lines).instances
    ).toEqual([]);
  });

  it("is empty without an active promotion", () => {
    expect(evaluate([], [line(10, 1), line(11, 2)]).instances).toEqual([]);
  });

  it("keeps disjoint promotions applying side by side", () => {
    const state = evaluate(
      [
        source({ id: "1", memberIds: ["1", "2"], amount: 1000 }),
        source({ id: "2", memberIds: ["3"], label: "Masik" }),
      ],
      [line(10, 1), line(11, 2)]
    );

    expect(state.total).toBe(1000);
    expect(state.instances).toHaveLength(1);
  });
});
