import type { APIRoute } from "astro";
import { getMaterials, getProducts } from "@/lib/catalog";
import { buildCatalogSitemap } from "@/lib/catalog/sitemap";

export const prerender = false;

export const GET: APIRoute = async ({ site, cache }) => {
  try {
    const [products, materials] = await Promise.all([getProducts(), getMaterials()]);

    return new Response(buildCatalogSitemap(String(site), products, materials), {
      headers: { "Content-Type": "application/xml" },
    });
  } catch {
    cache.set(false);

    return new Response(null, { status: 503 });
  }
};
