/**
 * Contract test: runs every catalog query document against a live backend and
 * parses the real response with the site's zod schemas, catching drift between
 * the queries/schemas and the shop API (custom fields, visibility rules).
 * Skipped unless CATALOG_CONTRACT_API_URL is set, e.g. against
 * `pnpm -C backend run e2e:server` (http://localhost:4000) or a seeded dev
 * backend: CATALOG_CONTRACT_API_URL=http://localhost:4000 pnpm test
 */
import { describe, expect, it } from "vitest";
import { createShopQuery } from "@/lib/vendure/transport";
import { getCatalog, getMaterial, getMaterials, getProduct, getProducts } from "./index";

const apiUrl = process.env.CATALOG_CONTRACT_API_URL;

describe.skipIf(apiUrl === undefined)("catalog contract against the live shop API", () => {
  const run = createShopQuery({
    fetch: (input, init) => fetch(input, init),
    apiUrl: apiUrl ?? "",
    languageCode: "hu",
  });

  it("serves every catalog query in the shape the schemas expect", async () => {
    const [catalog, products, materials] = await Promise.all([
      getCatalog(run),
      getProducts(run),
      getMaterials(run),
    ]);

    expect(catalog.products.map((product) => product.slug)).toEqual(
      products.map((product) => product.slug)
    );
    expect(catalog.materials.map((material) => material.slug)).toEqual(
      materials.map((material) => material.slug)
    );

    const product = products.at(0);
    const material = materials.at(0);

    if (product !== undefined) {
      expect(await getProduct(product.slug, run)).not.toBeNull();
    }

    if (material !== undefined) {
      expect(await getMaterial(material.slug, run)).not.toBeNull();
    }
  });
});
