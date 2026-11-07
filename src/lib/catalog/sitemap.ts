import type { CatalogMaterial, CatalogProduct } from "./mappers";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const urls = paths.map((path) => `<url><loc>${escapeXml(new URL(path, site).href)}</loc></url>`);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`;
}
