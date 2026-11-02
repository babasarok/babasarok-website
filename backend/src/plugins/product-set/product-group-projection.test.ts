import { describe, expect, it } from "vitest";
import { projectGroups, type ProductGroupCollection } from "./product-group-projection";

const ids = new Map([
  [1, "alpha"],
  [2, "beta"],
  [3, "gamma"],
]);

function group(productIds: number[], setDiscount: number | null): ProductGroupCollection {
  return {
    slug: "g",
    name: "Csoport",
    filters: [
      {
        code: "product-id-filter",
        args: [{ name: "productIds", value: JSON.stringify(productIds.map(String)) }],
      },
    ],
    setDiscount,
  };
}

describe("projectGroups", () => {
  it("maps native member ids to definition ids and keeps the set discount", () => {
    expect(projectGroups("set", [group([1, 2], 500)], ids)).toEqual([
      { id: "g", kind: "set", label: "Csoport", discount: 500, productIds: ["alpha", "beta"] },
    ]);
  });

  it("drops groups with fewer than two known members", () => {
    expect(projectGroups("related", [group([1, 99], null)], ids)).toEqual([]);
  });

  it("drops sets without a positive discount but keeps related groups", () => {
    expect(projectGroups("set", [group([1, 2], null), group([1, 2], 0)], ids)).toEqual([]);
    expect(projectGroups("related", [group([1, 3], 700)], ids)[0]?.discount).toBeNull();
  });
});
