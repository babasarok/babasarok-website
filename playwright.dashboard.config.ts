import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the Vendure dashboard (backend/src/dashboard) — the custom
 * "Anyagok" section. Follows playwright.config.ts: the dashboard SPA is served
 * by `wrangler dev` over the site build (ADR 0008), so a build must exist
 * (`pnpm run build:local` locally; CI reuses the build job's dist artifact).
 *
 * Unlike the hydration run, a second webServer boots the Vendure API via
 * `pnpm -C backend run e2e:server` (backend/e2e.env): it re-creates a fresh
 * e2e database, migrates, seeds fixed materials, and serves on :4000 — the
 * origin the dashboard bundle bakes in at build time. The API port must be
 * free (stop the dev backend first), and servers are never reused: a reused
 * one would carry unknown database state.
 */
const PORT = 4100;
const SITE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/dashboard",
  fullyParallel: false,
  workers: 1,
  // One long journey test: two uploads and several save/reload round-trips.
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `${SITE_URL}/dashboard`,
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
      url: `${SITE_URL}/dashboard/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
