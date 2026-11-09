import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { variantOptionReadSelectors } from "./variant-option-reads";

function violations(code: string): number {
  const linter = new Linter({ configType: "flat" });

  return linter.verify(
    code,
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser },
      rules: { "no-restricted-syntax": ["error", ...variantOptionReadSelectors] },
    },
    "guarded.ts"
  ).length;
}

describe("variant option read guard (ADR 0016)", () => {
  it.each([
    ["a hydrated variant's options", "const codes = productVariant.options.map((o) => o.code);"],
    ["a line's variant options", "line.productVariant.options.map((o) => o.code);"],
    [
      "a nested relation load",
      "repo.find({ relations: { productVariant: { options: { group: true } } } });",
    ],
    ["a hydrator relation path", 'hydrate(ctx, v, { relations: ["options", "options.group"] });'],
  ])("blocks %s", (_name, code) => {
    expect(violations(code)).toBeGreaterThan(0);
  });

  it("lets selections-based code through", () => {
    expect(violations("const codes = axisCodes(definition, selections, 'hu');")).toBe(0);
  });
});
