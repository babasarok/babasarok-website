import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      // The seed's Tina-content parser lives under scripts/ (the scripts
      // tsconfig's rootDir), its tests still run in this fast suite.
      "scripts/**/*.test.ts",
    ],
  },
});
