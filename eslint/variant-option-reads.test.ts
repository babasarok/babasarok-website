import { existsSync } from "node:fs";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { variantOptionReadAllowlist, variantOptionReadSelectors } from "./variant-option-reads";

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
    [
      "a filter on a line's variant options",
      "repo.find({ where: { productVariant: { options: { id: 1 } } } });",
    ],
  ])("blocks %s", (_name, code) => {
    expect(violations(code)).toBeGreaterThan(0);
  });

  it("lets selections-based code through", () => {
    expect(violations("const codes = axisCodes(definition, selections, 'hu');")).toBe(0);
  });

  it("lets a fixture build a line's variant", () => {
    expect(violations("const line = { productVariant: { id: '3', options: [] } };")).toBe(0);
  });

  it.each(variantOptionReadAllowlist)("allowlists %s, which exists", (path) => {
    expect(existsSync(path), `${path} is gone: remove it from variantOptionReadAllowlist`).toBe(
      true
    );
  });
});
