import { describe, expect, it } from "vitest";
import {
  matchCatalogEntries,
  toCatalogSearchEntries,
  type CatalogSearchEntry,
  type SearchMaterial,
  type SearchProduct,
} from "./searchIndex";

const entries: CatalogSearchEntry[] = [
  { title: "Rácsvédő", url: "/product/racsvedo/", section: "product", excerpt: "Babaágyba" },
  { title: "Pamut", url: "/material/pamut/", section: "material", excerpt: "Puha anyag" },
];

describe("matchCatalogEntries", () => {
  it("ignores case and accents", () => {
    expect(matchCatalogEntries(entries, "racsvedo").map((entry) => entry.url)).toEqual([
      "/product/racsvedo/",
    ]);
  });

  it("matches the excerpt too", () => {
    expect(matchCatalogEntries(entries, "puha").map((entry) => entry.section)).toEqual([
      "material",
    ]);
  });

  it("returns nothing for a blank term", () => {
    expect(matchCatalogEntries(entries, "  ")).toEqual([]);
  });
});

describe("toCatalogSearchEntries", () => {
  const product = {
    slug: "szipka",
    name: "Szíps",
    shortDescription: "Rövid",
    popularityRank: 1,
  } satisfies SearchProduct;

  const material = {
    slug: "pamut",
    label: "Pamut",
    subtitle: "Puha",
  } satisfies SearchMaterial;

  it("links the Hungarian unprefixed paths", () => {
    expect(toCatalogSearchEntries([product], [material], "hu").map((entry) => entry.url)).toEqual([
      "/product/szipka/",
      "/material/pamut/",
    ]);
  });

  it("links the /en/ paths for English", () => {
    expect(toCatalogSearchEntries([product], [material], "en").map((entry) => entry.url)).toEqual([
      "/en/product/szipka/",
      "/en/material/pamut/",
    ]);
  });
});
