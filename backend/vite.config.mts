import { LanguageCode } from "@vendure/common/lib/generated-types";
import { vendureDashboardPlugin } from "@vendure/dashboard/vite";
import path from "node:path";
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
  // The @babasarok packages are consumed as their TypeScript source: vite
  // compiles them for dev and build alike, so no CJS dist ever enters the
  // browser graph and no CJS interop is needed. The backend keeps consuming
  // their built dist through tsc project references. Object form, not array:
  // the vendure dashboard plugin merges user aliases by object-spread.
  resolve: {
    alias: {
      "@babasarok/product-definition/node": path.resolve(
        import.meta.dirname,
        "src",
        "node.ts"
      ),
      "@babasarok/product-definition": path.resolve(
        import.meta.dirname,
        "..",
        "packages",
        "product-definition",
        "src",
        "index.ts"
      ),
      "@babasarok/pricing": path.resolve(
        import.meta.dirname,
        "..",
        "packages",
        "pricing",
        "src",
        "index.ts"
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/admin-api": `http://localhost:${process.env.PORT ?? 4000}` },
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
});
