import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { catalogFetchImports, onDemandPageSelectors } from "./catalog-rendering";

function violations(code: string, rules: Linter.RulesRecord): number {
  const linter = new Linter({ configType: "flat" });

  return linter.verify(
    code,
    { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser }, rules },
    "guarded.ts"
  ).length;
}

const importRule = {
  "no-restricted-imports": ["error", { paths: [catalogFetchImports] }],
} satisfies Linter.RulesRecord;
const prerenderRule = {
  "no-restricted-syntax": ["error", ...onDemandPageSelectors],
} satisfies Linter.RulesRecord;

describe("catalog rendering guard (ADR 0017)", () => {
  it.each(["getCatalog", "getProducts", "getProduct", "getMaterials", "getMaterial"])(
    "blocks importing the shop-API fetcher %s",
    (name) => {
      expect(violations(`import { ${name} } from "@/lib/catalog";`, importRule)).toBe(1);
    }
  );

  it("lets catalog types and helpers through", () => {
    expect(
      violations('import { byPopularity, type CatalogProduct } from "@/lib/catalog";', importRule)
    ).toBe(0);
  });

  it("blocks rendering a page on demand", () => {
    expect(violations("export const prerender = false;", prerenderRule)).toBe(1);
  });

  it("lets prerendered pages through", () => {
    expect(violations("export const prerender = true;", prerenderRule)).toBe(0);
  });
});
