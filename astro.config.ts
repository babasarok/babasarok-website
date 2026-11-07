import { fileURLToPath } from "node:url";
import { defineConfig, envField, fontProviders } from "astro/config";
import svelte from "@astrojs/svelte";
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import tina from "@tinacms/astro/integration";
import { tinaAdminDevRedirect } from "@tinacms/astro/vite";
import tailwindcss from "@tailwindcss/vite";
import pagefind from "astro-pagefind";
import { unified } from "@astrojs/markdown-remark";
import { remarkAssetImages } from "./src/lib/assets/remarkAssetImages";
import { devProxy } from "./integrations/dev-proxy";
import { vendureDashboard } from "./integrations/vendure-dashboard";
import { previewApiUrl } from "./src/lib/preview-url";
import { defaultLocale, locales } from "./src/lib/i18n";

const site = process.env.SITE_URL || "https://babasarok.net";

// https://astro.build/config
export default defineConfig({
  site,
  output: "static",
  adapter: cloudflare({
    // Build-time work (filesystem reads in prerendered endpoints, sharp image
    // optimization) stays on Node; only the on-demand surface — the dashboard
    // SPA fallback — runs in workerd.
    prerenderEnvironment: "node",
    // Keep sharp build-time image optimization for prerendered routes instead
    // of the adapter's default runtime Images binding.
    imageService: "compile",
  }),
  // No Astro sessions; the adapter would otherwise provision a KV namespace.
  session: false,
  redirects: { "/home": "/" },
  // On-demand catalog pages (ADR 0012): an edit is live within maxAge, and a
  // failing backend is hidden behind stale copies for up to swr more seconds.
  // The /en/ mirrors exist for the epic-8 locale routes (route rules support
  // no globs, see ADR 0015); they are inert until those routes land.
  cache: { provider: cacheCloudflare() },
  routeRules: {
    "/product": { maxAge: 60, swr: 300 },
    "/en/product": { maxAge: 60, swr: 300 },
    "/product/[id]": { maxAge: 60, swr: 300 },
    "/en/product/[id]": { maxAge: 60, swr: 300 },
    "/material": { maxAge: 60, swr: 300 },
    "/en/material": { maxAge: 60, swr: 300 },
    "/material/[slug]": { maxAge: 60, swr: 300 },
    "/en/material/[slug]": { maxAge: 60, swr: 300 },
    "/search-index.json": { maxAge: 60, swr: 300 },
    "/en/search-index.json": { maxAge: 60, swr: 300 },
    "/sitemap-catalog.xml": { maxAge: 3600 },
  },
  i18n: {
    defaultLocale,
    locales: [...locales],
    fallback: { en: "hu" },
  },
  prefetch: true,
  integrations: [
    devProxy(),
    // Builds the vendure dashboard into dist/dashboard on every build.
    vendureDashboard(),
    // Catalog pages are on demand, so the integration cannot see their urls.
    // The i18n option emits xhtml:link alternates per URL (sitemap-method
    // hreflang, ADR 0015): unprefixed urls get hu-HU, /en/ urls get en.
    sitemap({
      customSitemaps: [`${site}/sitemap-catalog.xml`],
      i18n: { defaultLocale, locales: { hu: "hu-HU", en: "en" } },
    }),
    icon(),
    tina(),
    svelte(),
    pagefind(),
  ],
  markdown: {
    processor: unified({
      // Rewrite Tina's root-absolute image refs so Astro optimizes them from
      // src/assets instead of 404-ing against public/.
      remarkPlugins: [remarkAssetImages],
    }),
  },
  build: {
    // Inline the (~10 KiB) bundled CSS into a <style> in <head> instead of a
    // separate render-blocking <link>. Astro's default ('auto') only inlines
    // stylesheets under ~4 KiB, leaving ours blocking first paint on mobile.
    inlineStylesheets: "always",
  },
  // Tina Cloud rewrites CMS image src to assets.tina.io; let Astro
  // fetch those URLs at build time so <Image> can transcode + resize them.
  image: {
    // Responsive images: auto-emit srcset so the browser picks a
    // variant matched to the rendered box + DPR, not the full intrinsic size.
    layout: "constrained",
    remotePatterns: [{ protocol: "https", hostname: "assets.tina.io" }],
  },
  fonts: [
    {
      cssVariable: "--font-base",
      provider: fontProviders.google(),
      name: "Poppins",
      weights: ["400", "500", "600", "700"],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
    },
    {
      cssVariable: "--font-heading",
      provider: fontProviders.google(),
      name: "Yeseva One",
      weights: ["400", "500"],
      subsets: ["latin", "latin-ext"],
    },
  ],
  vite: {
    plugins: [tailwindcss(), tinaAdminDevRedirect()],
    resolve: {
      alias: {
        // The canonical shared schemas and pricing logic live inside the
        // backend's source tree; these aliases keep the site importing them
        // as TypeScript source, so no CJS dist enters the browser graph.
        "@babasarok/product-definition": fileURLToPath(
          new URL("backend/src/shared/product-definition/index.ts", import.meta.url)
        ),
        "@babasarok/pricing": fileURLToPath(
          new URL("backend/src/shared/pricing/index.ts", import.meta.url)
        ),
      },
    },
    // Bundle @tinacms/astro into the SSR build instead of resolving it
    // per-module on every cold request — otherwise each
    // `import TinaMarkdown from '@tinacms/astro/TinaMarkdown.astro'`
    // triggers a full Vite resolve + Astro-plugin compile of the
    // package's source `.astro` files on the first request.
    ssr: {
      noExternal: ["@tinacms/astro", "@tinacms/bridge"],
    },
    build: {
      rolldownOptions: {
        onLog(level, log, defaultHandler) {
          if (log.code === "UNUSED_EXTERNAL_IMPORT" && log.exporter === "tinacms/dist/client") {
            return;
          }
          defaultHandler(level, log);
        },
      },
    },
  },
  env: {
    schema: {
      GTM_ID: envField.string({
        context: "client",
        access: "public",
        optional: false,
      }),
      // Vendure shop API the checkout island submits orders to.
      PUBLIC_VENDURE_API_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default:
          previewApiUrl({
            stack: process.env.DEPLOY_STACK,
            branch: process.env.WORKERS_CI_BRANCH,
          }) ?? "http://localhost:4000",
      }),
    },
  },
});
