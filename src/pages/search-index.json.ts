import type { APIRoute } from "astro";
import { getMaterials, getProducts } from "@/lib/catalog";
import { toCatalogSearchEntries } from "@/lib/catalog/searchIndex";

export const prerender = false;

export const GET: APIRoute = async ({ cache }) => {
  try {
    const [products, materials] = await Promise.all([getProducts(), getMaterials()]);

    return Response.json(toCatalogSearchEntries(products, materials));
  } catch {
    cache.set(false);

    return new Response(null, { status: 503 });
  }
};
