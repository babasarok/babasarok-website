import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the basket and checkout (tests/checkout) against a real
 * Vendure API. Follows playwright.dashboard.config.ts: the site is served
 * by `wrangler dev` over the site build (ADR 0008), so a build must exist
 * (`pnpm run build:local` locally; CI reuses the build job's dist artifact).
 *
 * Unlike the hydration run, a second webServer boots the Vendure API via
 * `pnpm -C backend run e2e:server` (backend/e2e.env): it re-creates a fresh
 * e2e database, migrates, seeds fixed materials, and serves on :4000 — the
 * origin the site build bakes in (PUBLIC_VENDURE_API_URL default). The API port must be
 * free (stop the dev backend first), and servers are never reused: a reused
 * one would carry unknown database state.
 */
const PORT = 4100;
const SITE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/checkout",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: SITE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm -C backend run e2e:server",
      url: "http://localhost:4000/health",
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      command: `npx wrangler dev --config dist/server/wrangler.json --port ${PORT}`,
      url: `${SITE_URL}/product/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
