import { describe, expect, it } from "vitest";
import {
  allocateSetDiscounts,
  lineDiscounts,
  type AllocationGroup,
  type AllocationLine,
  type SetInstance,
} from "./set-allocation";

const line = (overrides: Partial<AllocationLine> & { lineId: string }): AllocationLine => ({
  productId: "a",
  quantity: 1,
  unitPrice: 10_000,
  materials: [],
  ...overrides,
});

const group = (overrides: Partial<AllocationGroup> & { groupId: string }): AllocationGroup => ({
  label: overrides.groupId,
  discount: 1000,
  productIds: ["a", "b"],
  ...overrides,
});

describe("materialsMatch via allocation", () => {
  it("forms nothing for a single member", () => {
    const instances = allocateSetDiscounts([line({ lineId: "1" })], [group({ groupId: "g" })]);

    expect(instances).toEqual([]);
  });

  it("forms one instance per matching pair and clamps nothing when it fits", () => {
    const instances = allocateSetDiscounts(
      [line({ lineId: "1" }), line({ lineId: "2", productId: "b" })],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([
      { groupId: "g", label: "g", members: ["1", "2"], nominal: 1000, amount: 1000 },
    ]);
  });

  it("does not pair two lines of the same product", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", productId: "a", quantity: 2 }),
        line({ lineId: "2", productId: "a", quantity: 1 }),
      ],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([]);
  });

  it("does not match different material selections", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", materials: [{ materialId: "wellsoft", colors: ["piros"] }] }),
        line({ lineId: "2", productId: "b", materials: [{ materialId: "minky", colors: [] }] }),
      ],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([]);
  });

  it("matches when the smaller selection is a subset of the larger", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", materials: [{ materialId: "wellsoft", colors: [] }] }),
        line({
          lineId: "2",
          productId: "b",
          materials: [
            { materialId: "wellsoft", colors: [] },
            { materialId: "minky", colors: [] },
          ],
        }),
      ],
      [group({ groupId: "g" })]
    );

    expect(instances).toHaveLength(1);
  });

  it("requires an exact match when material counts are equal", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", materials: [{ materialId: "wellsoft", colors: [] }] }),
        line({
          lineId: "2",
          productId: "b",
          materials: [{ materialId: "wellsoft", colors: ["piros"] }],
        }),
      ],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([]);
  });

  it("keeps the same fabric in two colours as distinct selections", () => {
    const instances = allocateSetDiscounts(
      [
        line({
          lineId: "1",
          materials: [
            { materialId: "wellsoft", colors: ["piros"] },
            { materialId: "wellsoft", colors: ["kek"] },
          ],
        }),
        line({ lineId: "2", productId: "b", materials: [{ materialId: "wellsoft", colors: [] }] }),
      ],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([]);
  });
});

describe("allocation order and consumption", () => {
  it("caps a partner line: one B unit pairs with one A unit", () => {
    const instances = allocateSetDiscounts(
      [line({ lineId: "1", quantity: 2 }), line({ lineId: "2", productId: "b" })],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([
      { groupId: "g", label: "g", members: ["1", "2"], nominal: 1000, amount: 1000 },
    ]);
  });

  it("repeats on leftovers while at least two distinct members remain", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", quantity: 3 }),
        line({ lineId: "2", productId: "b", quantity: 2 }),
        line({ lineId: "3", productId: "c", quantity: 1 }),
      ],
      [group({ groupId: "g", productIds: ["a", "b", "c"] })]
    );

    expect(instances.map((instance) => instance.members)).toEqual([
      ["1", "2", "3"],
      ["1", "2"],
    ]);
  });

  it("allocates the biggest-amount set first per unit", () => {
    const instances = allocateSetDiscounts(
      [line({ lineId: "1" }), line({ lineId: "2", productId: "b" })],
      [
        group({ groupId: "small", discount: 500 }),
        group({ groupId: "big", label: "Nagy szett", discount: 2000 }),
      ]
    );

    expect(instances).toEqual([
      { groupId: "big", label: "Nagy szett", members: ["1", "2"], nominal: 2000, amount: 2000 },
    ]);
  });

  it("a unit consumed by the bigger set is unavailable to the smaller one", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", quantity: 1 }),
        line({ lineId: "2", productId: "b", quantity: 1 }),
        line({ lineId: "3", productId: "b", quantity: 1 }),
      ],
      [
        group({ groupId: "big", discount: 2000 }),
        group({ groupId: "small", discount: 500, productIds: ["a", "b"] }),
      ]
    );

    expect(instances.map((instance) => instance.members)).toEqual([["1", "2"]]);
  });

  it("prefers the most valuable line for interchangeable units", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "cheap", productId: "a", quantity: 2, unitPrice: 5000 }),
        line({ lineId: "dear", productId: "a", quantity: 1, unitPrice: 9000 }),
        line({ lineId: "b", productId: "b", quantity: 1 }),
      ],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([
      { groupId: "g", label: "g", members: ["dear", "b"], nominal: 1000, amount: 1000 },
    ]);
  });
});

describe("clamping", () => {
  it("clamps the deduction to the covered units' subtotal", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", unitPrice: 300 }),
        line({ lineId: "2", productId: "b", unitPrice: 400 }),
      ],
      [group({ groupId: "g", discount: 5000 })]
    );

    expect(instances).toEqual([
      { groupId: "g", label: "g", members: ["1", "2"], nominal: 5000, amount: 700 },
    ]);
  });

  it("sums to the total across instances", () => {
    const instances = allocateSetDiscounts(
      [
        line({ lineId: "1", quantity: 2, unitPrice: 300 }),
        line({ lineId: "2", productId: "b", quantity: 2, unitPrice: 400 }),
      ],
      [group({ groupId: "g", discount: 1000 })]
    );

    expect(instances.map((instance) => instance.amount)).toEqual([700, 700]);
  });

  it("ignores zero-discount groups entirely", () => {
    const instances = allocateSetDiscounts(
      [line({ lineId: "1" }), line({ lineId: "2", productId: "b" })],
      [group({ groupId: "g", discount: 0 })]
    );

    expect(instances).toEqual([]);
  });

  it("leaves non-member products out", () => {
    const instances = allocateSetDiscounts(
      [line({ lineId: "1", productId: "x" }), line({ lineId: "2", productId: "b" })],
      [group({ groupId: "g" })]
    );

    expect(instances).toEqual([]);
  });
});

describe("lineDiscounts", () => {
  it("prorates an instance across its members and sums exactly to the amount", () => {
    const instances: SetInstance[] = [
      { groupId: "g", label: "g", members: ["1", "2"], nominal: 1000, amount: 1000 },
    ];

    const discounts = lineDiscounts(instances, new Map([
      ["1", 9000],
      ["2", 3000],
    ]));

    expect(discounts.get("1")).toBe(750);
    expect(discounts.get("2")).toBe(250);
    expect([...discounts.values()].reduce((sum, value) => sum + value, 0)).toBe(1000);
  });

  it("hands floored remainders to the largest fractional share", () => {
    const instances: SetInstance[] = [
      { groupId: "g", label: "g", members: ["1", "2", "3"], nominal: 1000, amount: 1000 },
    ];

    const discounts = lineDiscounts(instances, new Map([
      ["1", 1000],
      ["2", 1000],
      ["3", 1000],
    ]));

    expect([...discounts.values()].reduce((sum, value) => sum + value, 0)).toBe(1000);
    expect(discounts.get("1")).toBe(334);
    expect(discounts.get("3")).toBe(333);
  });

  it("adds up a line covered by several instances", () => {
    const instances: SetInstance[] = [
      { groupId: "a", label: "a", members: ["1", "2"], nominal: 1000, amount: 1000 },
      { groupId: "b", label: "b", members: ["1", "3"], nominal: 500, amount: 500 },
    ];

    const discounts = lineDiscounts(instances, new Map([
      ["1", 5000],
      ["2", 3000],
      ["3", 3000],
    ]));

    expect(discounts.get("1")).toBe(625 + 313);
    expect(discounts.get("2")).toBe(375);
    expect(discounts.get("3")).toBe(187);
  });
});
