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
  plugins: [
    // Serves the astro:env/client virtual module for unit tests with the
    // schema-default values from astro.config.ts, so modules like
    // order/submit.ts (which read PUBLIC_VENDURE_API_URL through the env
    // schema) resolve in plain Vitest.
    {
      name: "astro-env-client-shim",
      resolveId(id) {
        if (id === "astro:env/client") {
          return "\0astro-env-client";
        }
      },
      load(id) {
        if (id === "\0astro-env-client") {
          return 'export const GTM_ID = "GTM-TEST";\nexport const PUBLIC_VENDURE_API_URL = "http://localhost:4000";';
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@babasarok/product-definition": fileURLToPath(
        new URL("packages/product-definition/src/index.ts", import.meta.url)
      ),
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      // The shared package's schema tests run in the same fast suite; they are
      // excluded from the package's own tsc build (see its tsconfig.json).
      "packages/product-definition/src/**/*.test.ts",
      "packages/pricing/src/**/*.test.ts",
    ],
    exclude: ["tests/**", "node_modules/**", "dist/**"],
    environment: "node",
  },
});
