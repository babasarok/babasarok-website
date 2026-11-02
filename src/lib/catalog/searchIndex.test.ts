import { describe, expect, it } from "vitest";
import { matchCatalogEntries, type CatalogSearchEntry } from "./searchIndex";

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
