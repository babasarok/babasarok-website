import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["integration/**/*.test.ts"],
    setupFiles: ["integration/env.ts"],
    // One shared database name: files boot and drop it one after another.
    fileParallelism: false,
    onConsoleLog: (log) => !log.includes("Skipping de-duplication"),
    testTimeout: 60_000,
    hookTimeout: 180_000,
    server: {
      // The built server (dist/) is plain CommonJS and must load through
      // Node, not vite's transform.
      deps: { external: [/\/backend\/dist\//] },
    },
  },
});
