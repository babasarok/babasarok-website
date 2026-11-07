import type { APIRoute } from "astro";
import { localeFromPathname, VENDURE_LANGUAGE_CODE } from "@/lib/i18n";
import { getMaterials, getProducts } from "@/lib/catalog";
import { toCatalogSearchEntries } from "@/lib/catalog/searchIndex";

export const prerender = false;

export const GET: APIRoute = async ({ cache, url }) => {
  const languageCode = VENDURE_LANGUAGE_CODE[localeFromPathname(url.pathname)];

  try {
    const [products, materials] = await Promise.all([
      getProducts(undefined, languageCode),
      getMaterials(undefined, languageCode),
    ]);

    return Response.json(
      toCatalogSearchEntries(products, materials, localeFromPathname(url.pathname))
    );
  } catch {
    cache.set(false);

    return new Response(null, { status: 503 });
  }
};
