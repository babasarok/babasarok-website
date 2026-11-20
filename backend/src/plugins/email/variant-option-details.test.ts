import { describe, expect, it } from "vitest";
import { optionDetailRows } from "./variant-option-details";

describe("optionDetailRows", () => {
  it("builds one label/value row per option at depth 0", () => {
    expect(
      optionDetailRows([
        { name: "L", group: { id: 3, name: "Méret" } },
        { name: "Piros", group: { id: 1, name: "Szín" } },
      ])
    ).toEqual([
      { label: "Szín", value: "Piros", depth: 0 },
      { label: "Méret", value: "L", depth: 0 },
    ]);
  });

  it("returns no rows for a variant without options", () => {
    expect(optionDetailRows([])).toEqual([]);
  });
});
