import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the browser-level checks in `tests/` (currently the Svelte
 * client-island hydration guard).
 *
 * `webServer` boots `astro preview` against the existing `dist/` build and tears
 * it down afterwards, so a build must already exist (`npm run build` in CI, or
 * `npm run build:local` locally). Locally an already-running server on the port
 * is reused; CI always starts a fresh one.
 */
const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
