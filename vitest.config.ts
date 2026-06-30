import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit-test config for the order-form domain logic in `src/lib/*`
 * (pricing, validation, material handling, order-string formatting).
 *
 * Kept separate from `playwright.config.ts`: Playwright owns the browser-level
 * hydration checks in `tests/`, Vitest owns the fast pure-logic unit tests
 * co-located under `src/**`. The two never overlap (`tests/` is excluded here).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**", "dist/**"],
    environment: "node",
  },
});
