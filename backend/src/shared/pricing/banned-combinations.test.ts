import { describe, expect, it } from "vitest";
import { completesForbiddenCombination, forbiddenMaterialFieldIds } from "./banned-combinations.ts";
import type { LineSelections } from "../product-definition/index.ts";

describe("completesForbiddenCombination", () => {
  it("bans a material chosen twice when the rule lists it twice", () => {
    expect(completesForbiddenCombination(["a", "a"], [["a", "a"]])).toBe(true);
    expect(completesForbiddenCombination(["a", "b"], [["a", "a"]])).toBe(false);
  });

  it("bans a mixed pair wherever the materials sit", () => {
    expect(completesForbiddenCombination(["c", "b", "a"], [["a", "b"]])).toBe(true);
    expect(completesForbiddenCombination(["a", "c"], [["a", "b"]])).toBe(false);
  });

  it("bans nothing without rules", () => {
    expect(completesForbiddenCombination(["a", "a"], [])).toBe(false);
  });
});

describe("forbiddenMaterialFieldIds", () => {
  it("names only the fields whose pick is in a completed rule", () => {
    const selections = {
      one: { kind: "material", materialId: "a", colors: [] },
      two: { kind: "material", materialId: "b", colors: [] },
      three: { kind: "material", materialId: "c", colors: [] },
    } satisfies LineSelections;

    expect([...forbiddenMaterialFieldIds([["a", "b"]], selections)].toSorted()).toEqual([
      "one",
      "two",
    ]);
    expect(forbiddenMaterialFieldIds([["a", "c", "c"]], selections).size).toBe(0);
  });
});
