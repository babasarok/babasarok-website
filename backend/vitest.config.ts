import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests import the shared package's TypeScript source, so schema changes
    // never require a package rebuild.
    alias: {
      // The node entry must shadow the barrel alias, which would otherwise
      // swallow the /node subpath as a barrel suffix (exact-or-slash matching).
      "@babasarok/product-definition/node": new URL(
        "../packages/product-definition/src/node.ts",
        import.meta.url
      ).pathname,
      "@babasarok/pricing": new URL("../packages/pricing/src/index.ts", import.meta.url).pathname,
      "@babasarok/product-definition": new URL(
        "../packages/product-definition/src/index.ts",
        import.meta.url
      ).pathname,
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      // The seed's Tina-content parser lives under scripts/ (the scripts
      // tsconfig's rootDir), its tests still run in this fast suite.
      "scripts/**/*.test.ts",
    ],
  },
});
