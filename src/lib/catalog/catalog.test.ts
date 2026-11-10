import { describe, expect, it } from "vitest";
import type { ShopQuery } from "@/lib/vendure/transport";
import materials from "./__fixtures__/materials.json";
import productGroups from "./__fixtures__/product-groups.json";
import product from "./__fixtures__/product.json";
import products from "./__fixtures__/products.json";
import threadColors from "./__fixtures__/thread-colors.json";
import {
  byPopularity,
  getCatalog,
  getMaterial,
  getMaterials,
  getProduct,
  getProducts,
} from "./index";

function runReturning(...responses: unknown[]): ShopQuery & { variables: unknown[] } {
  const variables: unknown[] = [];
  const queue = [...responses];
  const run: ShopQuery = (request) => {
    variables.push(request.variables);

    return Promise.resolve(request.schema.parse(queue.shift()));
  };

  return Object.assign(run, { variables });
}

describe("getProducts", () => {
  it("maps rows to display products with the type from the product-type facet", async () => {
    const result = await getProducts(runReturning(products));
    const bag = result.find((entry) => entry.slug === "tornazsak");

    expect(result).toHaveLength(3);
    expect(bag).toMatchObject({
      type: { code: "zsak", name: "Zsák és tároló" },
      popularityRank: 22,
    });
    expect(bag?.definition.id).toBe("tornazsak");
    expect(bag?.thumbnailUrl).toMatch(/^http/);
  });

  it("pages until every product is loaded", async () => {
    const [first, ...rest] = products.products.items;
    const run = runReturning(
      { products: { totalItems: 3, items: [first] } },
      { products: { totalItems: 3, items: rest } }
    );

    expect(await getProducts(run)).toHaveLength(3);
    expect(run.variables).toEqual([
      { skip: 0, take: 100 },
      { skip: 1, take: 100 },
    ]);
  });

  it("leaves out products without a definition, still paging by fetched rows", async () => {
    const [first, ...rest] = products.products.items;
    const placeholder = { ...first, slug: "placeholder-x", productDefinition: null };
    const run = runReturning(
      { products: { totalItems: 4, items: [placeholder] } },
      { products: { totalItems: 4, items: [first, ...rest] } }
    );

    const result = await getProducts(run);

    expect(result.map((entry) => entry.slug)).not.toContain("placeholder-x");
    expect(result).toHaveLength(3);
    expect(run.variables).toEqual([
      { skip: 0, take: 100 },
      { skip: 1, take: 100 },
    ]);
  });

  it("rejects a definition that is not a valid canonical definition", async () => {
    const broken = structuredClone(products);

    broken.products.items[0].productDefinition = {
      ...products.products.items[0].productDefinition,
      basePrice: -1,
    };

    await expect(getProducts(runReturning(broken))).rejects.toThrow();
  });
});

describe("getProduct", () => {
  it("adds the gallery with descriptions", async () => {
    const result = await getProduct("tornazsak", runReturning(product));

    expect(result?.gallery).toHaveLength(product.product.assets.length);
    expect(result?.gallery[0]?.description).toBeNull();
  });

  it("carries the markdown description", async () => {
    expect((await getProduct("tornazsak", runReturning(product)))?.description).toBe(
      "**Tornazsák** leírása"
    );
  });

  it("is null for an unknown slug", async () => {
    expect(await getProduct("nope", runReturning({ product: null }))).toBeNull();
  });

  it("tolerates a product without images or type", async () => {
    const bare = {
      product: { ...product.product, featuredAsset: null, facetValues: [], assets: [] },
    };

    expect(await getProduct("tornazsak", runReturning(bare))).toMatchObject({
      thumbnailUrl: null,
      type: null,
      gallery: [],
    });
  });

  it("is null for a product without a definition", async () => {
    const placeholder = { product: { ...product.product, productDefinition: null } };

    expect(await getProduct("tornazsak", runReturning(placeholder))).toBeNull();
  });
});

describe("materials", () => {
  it("maps materials with colors", async () => {
    const result = await getMaterials(runReturning(materials));

    expect(result).toHaveLength(2);
    expect(result[0].colors.length).toBeGreaterThan(0);
    expect(Object.keys(result[0].colors[0])).toEqual(["id", "label", "hex", "imageUrl"]);
  });

  it("is null for an unknown material", async () => {
    expect(await getMaterial("nope", runReturning({ material: null }))).toBeNull();
  });
});

describe("getCatalog", () => {
  const catalogResponse = { ...products, ...materials, ...threadColors, ...productGroups };

  it("loads products, materials, thread colors and groups in one request", async () => {
    const run = runReturning(catalogResponse);
    const catalog = await getCatalog(run);

    expect(run.variables).toEqual([{ skip: 0, take: 100 }]);
    expect(catalog.products).toHaveLength(3);
    expect(catalog.materials).toHaveLength(2);
    expect(catalog.threadColors).toHaveLength(2);
    expect(catalog.groups.map((group) => group.kind)).toEqual(["set", "related"]);
    expect(catalog.groups[0]).toMatchObject({
      discount: 1300,
      productIds: ["tornazsak", "vallfas-zsak"],
    });
  });

  it("pages the products past the first page", async () => {
    const [first, ...rest] = products.products.items;
    const run = runReturning(
      { ...catalogResponse, products: { totalItems: 3, items: [first] } },
      { products: { totalItems: 3, items: rest } }
    );

    expect((await getCatalog(run)).products).toHaveLength(3);
    expect(run.variables).toEqual([
      { skip: 0, take: 100 },
      { skip: 1, take: 100 },
    ]);
  });
});

describe("byPopularity", () => {
  function ranked(
    slug: string,
    popularityRank: number | null
  ): { slug: string; popularityRank: number | null } {
    return { slug, popularityRank };
  }

  it("puts ranked products first by rank and unranked after, keeping their order", () => {
    const sorted = byPopularity([
      ranked("x", null),
      ranked("b", 2),
      ranked("y", null),
      ranked("a", 1),
    ]);

    expect(sorted.map((product) => product.slug)).toEqual(["a", "b", "x", "y"]);
  });
});
