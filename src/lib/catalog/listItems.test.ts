import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import { toProductListData } from "./listItems";
import { toProduct, type CatalogProduct } from "./mappers";
import productGroups from "./__fixtures__/product-groups.json";
import products from "./__fixtures__/products.json";
import { ProductGroupsResponseSchema, ProductsResponseSchema } from "./schemas";

const BASE = "https://api.example/assets/";
const fixtureProducts = ProductsResponseSchema.parse(products).products.items.flatMap(
  (row) => toProduct(row) ?? []
);
const baseProduct = fixtureProducts.at(0);

function product(overrides: Partial<CatalogProduct> & { slug: string }): CatalogProduct {
  if (baseProduct === undefined) {
    throw new Error("fixture has no products");
  }

  return {
    ...baseProduct,
    id: overrides.slug,
    name: overrides.slug,
    tagline: null,
    shortDescription: null,
    date: null,
    popularityRank: null,
    thumbnailUrl: null,
    type: null,
    definition: ProductDefinitionSchema.parse({ ...baseProduct.definition, id: overrides.slug }),
    ...overrides,
  };
}

describe("toProductListData", () => {
  it("computes set membership through definition ids and lists only sets as options", () => {
    const groups = ProductGroupsResponseSchema.parse(productGroups).productGroups;
    const { items, sets } = toProductListData(fixtureProducts, groups, BASE);

    expect(sets).toEqual([{ id: "ovis-szett", title: "Ovis szett" }]);
    expect(Object.fromEntries(items.map((item) => [item.id, item.sets]))).toEqual({
      "babatakaro-szett": [],
      "kismama-parna": [],
      tornazsak: ["ovis-szett"],
    });
  });

  it("omits products the definition hides from the list", () => {
    const hidden = fixtureProducts.map((row) => ({
      ...row,
      definition: { ...row.definition, hiddenInProductList: true },
    }));

    expect(toProductListData(hidden, [], BASE).items).toEqual([]);
  });

  it("orders by popularity rank and exposes that order", () => {
    const { items, popularOrder } = toProductListData(
      [
        product({ slug: "plain" }),
        product({ slug: "second", popularityRank: 2 }),
        product({ slug: "first", popularityRank: 1 }),
      ],
      [],
      BASE
    );

    expect(items.map((item) => item.href)).toEqual([
      "/product/first/",
      "/product/second/",
      "/product/plain/",
    ]);
    expect(popularOrder).toEqual(["first", "second", "plain"]);
  });

  it("keeps products without a known type, leaving type undefined", () => {
    const { items } = toProductListData(
      [
        product({ slug: "typed", type: { code: "takaro", name: "Takaró" } }),
        product({ slug: "unknown", type: { code: "mystery", name: "?" } }),
        product({ slug: "none" }),
      ],
      [],
      BASE
    );

    expect(items.map((item) => item.type)).toEqual(["takaro", undefined, undefined]);
  });

  it("maps tagline to the category line and builds the card image", () => {
    const { items } = toProductListData(
      [product({ slug: "a", tagline: "Alcím", thumbnailUrl: "source/ab/a.jpg" })],
      [],
      BASE
    );

    expect(items[0]?.category).toBe("Alcím");
    expect(items[0]?.image?.src).toContain("preset=card-lg");
    expect(items[0]?.image?.srcSet.attribute).toContain("300w");
  });
});
