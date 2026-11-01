import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests import the shared package's TypeScript source, so schema changes
    // never require a package rebuild.
    alias: {
      "@babasarok/product-definition": new URL(
        "../packages/product-definition/src/index.ts",
        import.meta.url
      ).pathname,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
