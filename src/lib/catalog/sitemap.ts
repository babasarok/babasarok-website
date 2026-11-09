import { defaultLocale, localizedPath, locales, type Locale } from "@/lib/i18n";
import type { CatalogMaterial, CatalogProduct } from "./mappers";

// Must match the sitemap integration's i18n hreflang values in
// astro.config.ts: unprefixed urls are hu-HU, /en/ urls are en.
const HREFLANG = {
  hu: "hu-HU",
  en: "en",
} as const satisfies Record<Locale, string>;

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function alternateLinks(path: string, site: string): string {
  return locales
    .map(
      (locale) =>
        `<xhtml:link rel="alternate" hreflang="${HREFLANG[locale]}" href="${escapeXml(
          new URL(localizedPath(path, locale), site).href
        )}"/>`
    )
    .join("");
}

export function buildCatalogSitemap(
  site: string,
  products: readonly CatalogProduct[],
  materials: readonly CatalogMaterial[]
): string {
  const paths = [
    ...products.map((product) => `/product/${product.slug}/`),
    ...materials.map((material) => `/material/${material.slug}/`),
  ];
  const urls = paths.map(
    (path) =>
      `<url><loc>${escapeXml(
        new URL(localizedPath(path, defaultLocale), site).href
      )}</loc>${alternateLinks(path, site)}</url>`
  );

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>\n`;
}
