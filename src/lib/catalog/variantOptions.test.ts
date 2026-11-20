import { describe, expect, it } from "vitest";
import { variantOptionRows } from "./variantOptions";

describe("variantOptionRows", () => {
  it("lists a line's options as group: option rows", () => {
    expect(
      variantOptionRows({
        options: [
          { name: "Kék", group: { name: "Szín" } },
          { name: "L", group: { name: "Méret" } },
        ],
      })
    ).toEqual([
      { label: "Szín", value: "Kék" },
      { label: "Méret", value: "L" },
    ]);
  });
});
