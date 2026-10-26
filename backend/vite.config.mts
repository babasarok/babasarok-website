import { LanguageCode } from "@vendure/common/lib/generated-types";
import { vendureDashboardPlugin } from "@vendure/dashboard/vite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";

// Builds the Vendure Dashboard served by the site's Cloudflare Worker at
// /dashboard. The vendureDashboardPlugin compiles and imports
// vendure-config.ts to introspect the Admin API schema, so the build needs
// the env vars vendure-config requires (build.env provides placeholders).
// DASHBOARD_OUT_DIR redirects the output into the Astro build's dist/;
// PUBLIC_VENDURE_API_URL is baked into the bundle as the Admin API origin.
// Without it (local dev), the dashboard calls its own origin and the dev
// server proxies the Admin API to the local backend.
function apiConfig(): { host: string; port: number | "auto" } {
  if (!process.env.PUBLIC_VENDURE_API_URL) {
    return { host: "auto", port: "auto" };
  }

  // The dashboard appends the hosting page's port to the host when port is
  // "auto", so the port is always pinned explicitly.
  const url = new URL(process.env.PUBLIC_VENDURE_API_URL);
  const defaultPort = url.protocol === "https:" ? 443 : 80;

  return { host: `${url.protocol}//${url.hostname}`, port: Number(url.port) || defaultPort };
}

export default defineConfig({
  base: "/dashboard/",
  build: {
    outDir: process.env.DASHBOARD_OUT_DIR ?? "dist/dashboard",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/admin-api": "http://localhost:4000" },
  },
  plugins: [
    vendureDashboardPlugin({
      vendureConfigPath: pathToFileURL("./src/vendure-config.ts"),
      api: apiConfig(),
      i18n: {
        defaultLanguage: LanguageCode.hu,
        availableLanguages: [LanguageCode.hu, LanguageCode.en],
      },
      gqlOutputPath: "./src/gql",
    }),
  ],
  resolve: {
    alias: {
      // Lets plugin dashboard extensions reference the shared generated types.
      "@/gql": resolve(__dirname, "./src/gql/graphql.ts"),
    },
  },
});
