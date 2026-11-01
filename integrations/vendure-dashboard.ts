/**
 * Builds the Vendure dashboard (a static React SPA whose source and vite
 * config live in backend/) straight into the Astro build output, so the
 * site's Cloudflare Worker serves it at /dashboard (ADR 0008). The backend
 * image no longer builds or serves it.
 *
 * Build-time only: `npm run dev` runs the dashboard's vite dev server
 * instead, proxied at /dashboard by integrations/dev-proxy.ts.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { previewApiUrl } from "../src/lib/preview-url";

/** Same fallback chain as the PUBLIC_VENDURE_API_URL env schema default. */
function vendureApiUrl(): string {
  return (
    process.env.PUBLIC_VENDURE_API_URL ??
    previewApiUrl({
      stack: process.env.DEPLOY_STACK,
      branch: process.env.WORKERS_CI_BRANCH,
    }) ??
    "http://localhost:4000"
  );
}

export function vendureDashboard(): AstroIntegration {
  return {
    name: "babasarok-vendure-dashboard",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const outDir = fileURLToPath(new URL("dashboard/", dir));
        logger.info(`building the vendure dashboard → ${outDir}`);
        const result = spawnSync(
          process.execPath,
          [
            "--env-file-if-exists=build.env",
            "--env-file-if-exists=.env",
            "node_modules/vite/bin/vite.js",
            "build",
          ],
          {
            cwd: "backend",
            stdio: "inherit",
            env: {
              ...process.env,
              DASHBOARD_OUT_DIR: outDir,
              PUBLIC_VENDURE_API_URL: vendureApiUrl(),
            },
          }
        );

        if (result.status !== 0) {
          throw new Error(`vendure dashboard build failed with exit code ${result.status}`);
        }
      },
    },
  };
}
