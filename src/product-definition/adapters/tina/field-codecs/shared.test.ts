import { describe, expect, it } from "vitest";

import type { TinaProductFieldDependencySource } from "../source-types";
import { compileVisibility, trimmedOptionalText } from "./shared";

function dependsOn(field: string | null, value: string | null): TinaProductFieldDependencySource {
  return { __typename: "ProductFieldsDepends_on", field, value };
}

describe("trimmedOptionalText", () => {
  it("trims text and drops blank values", () => {
    expect(trimmedOptionalText(null)).toBeUndefined();
    expect(trimmedOptionalText("   ")).toBeUndefined();
    expect(trimmedOptionalText(" megadva ")).toBe("megadva");
  });
});

describe("compileVisibility", () => {
  it("is always when no dependency field is given", () => {
    expect(compileVisibility(null)).toEqual({ kind: "always" });
    expect(compileVisibility(dependsOn(null, " x "))).toEqual({ kind: "always" });
    expect(compileVisibility(dependsOn("   ", "x"))).toEqual({ kind: "always" });
  });

  it("is when-present when the dependency value is empty", () => {
    expect(compileVisibility(dependsOn(" alt", null))).toEqual({
      kind: "when-present",
      fieldId: "alt",
    });
    expect(compileVisibility(dependsOn("alt", "  "))).toEqual({
      kind: "when-present",
      fieldId: "alt",
    });
  });

  it("is when-equal with the trimmed dependency value", () => {
    expect(compileVisibility(dependsOn(" alt ", " igen "))).toEqual({
      kind: "when-equal",
      fieldId: "alt",
      value: "igen",
    });
  });
});
