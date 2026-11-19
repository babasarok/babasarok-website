import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { historyStateSelectors } from "./history-state";

function violations(code: string): number {
  const linter = new Linter({ configType: "flat" });

  return linter.verify(
    code,
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser },
      rules: { "no-restricted-syntax": ["error", ...historyStateSelectors] },
    },
    "guarded.ts"
  ).length;
}

describe("history state guard (ClientRouter)", () => {
  it.each([
    ["a bare replaceState", 'history.replaceState(null, "", "#step-2");'],
    ["a bare pushState", 'history.pushState(null, "", "#step-2");'],
    ["a globalThis replaceState", 'globalThis.history.replaceState(null, "", "?sort=asc");'],
    ["a globalThis pushState", 'globalThis.history.pushState(history.state, "", "?sort=asc");'],
  ])("blocks %s", (_name, code) => {
    expect(violations(code)).toBeGreaterThan(0);
  });

  it("lets other history and state calls through", () => {
    expect(
      violations(`
        const count = history.length;
        const url = globalThis.location.href;
        window.scrollTo({ top: 0 });
      `)
    ).toBe(0);
  });
});
