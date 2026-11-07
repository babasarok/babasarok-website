import { describe, expect, it } from "vitest";
import { buildCatalogSitemap } from "./sitemap";
import type { CatalogMaterial, CatalogProduct } from "./mappers";

// Seam: the custom on-demand catalog sitemap vs. the sitemap integration's
// hreflang values (astro.config i18n: hu-HU unprefixed, en under /en/).
const product = {
  slug: "p&l",
} as CatalogProduct;
const material = {
  slug: "m",
} as CatalogMaterial;

describe("buildCatalogSitemap", () => {
  it("lists hu and en alternates on every url, matching the integration hreflang", () => {
    const xml = buildCatalogSitemap("https://example.com", [product], [material]);

    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain("<loc>https://example.com/product/p&amp;l/</loc>");
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="hu-HU" href="https://example.com/product/p&amp;l/"/>'
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/product/p&amp;l/"/>'
    );
    expect(xml).toContain("<loc>https://example.com/material/m/</loc>");
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="hu-HU" href="https://example.com/material/m/"/>'
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/material/m/"/>'
    );
  });
});
