import { describe, expect, it } from "vitest";
import materials from "./__fixtures__/materials.json";
import products from "./__fixtures__/products.json";
import { toMaterial, toProduct } from "./mappers";
import { MaterialsResponseSchema, ProductsResponseSchema } from "./schemas";
import { buildCatalogSitemap } from "./sitemap";

const catalogProducts = ProductsResponseSchema.parse(products).products.items.flatMap(
  (row) => toProduct(row) ?? []
);
const catalogMaterials = MaterialsResponseSchema.parse(materials).materials.map(toMaterial);

describe("buildCatalogSitemap", () => {
  const xml = buildCatalogSitemap("https://babasarok.net", catalogProducts, catalogMaterials);

  it("lists every product and material detail page as an absolute url", () => {
    expect(xml).toContain("<loc>https://babasarok.net/product/kismama-parna/</loc>");
    expect(xml.match(/<loc>/g)).toHaveLength(catalogProducts.length + catalogMaterials.length);
  });

  it("escapes xml special characters", () => {
    const [first] = catalogProducts;

    expect(first).toBeDefined();
    expect(buildCatalogSitemap("https://x.test", [{ ...first, slug: "a&b" }], [])).toContain(
      "a&amp;b"
    );
  });
});
