import { describe, expect, it } from "vitest";
import { projectGroups, type ProductGroupCollection } from "./product-group-projection";

const ids = new Map([
  [1, "alpha"],
  [2, "beta"],
  [3, "gamma"],
]);

function group(productIds: number[]): ProductGroupCollection {
  return {
    slug: "g",
    name: "Csoport",
    filters: [
      {
        code: "product-id-filter",
        args: [{ name: "productIds", value: JSON.stringify(productIds.map(String)) }],
      },
    ],
  };
}

describe("projectGroups (related collections)", () => {
  it("maps native member ids to definition ids as a related group", () => {
    expect(projectGroups([group([1, 2])], ids)).toEqual([
      { id: "g", kind: "related", label: "Csoport", discount: null, productIds: ["alpha", "beta"] },
    ]);
  });

  it("drops groups with fewer than two known members", () => {
    expect(projectGroups([group([1, 99])], ids)).toEqual([]);
  });
});
