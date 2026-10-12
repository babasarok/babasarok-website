import { describe, expect, it } from "vitest";
import { ProductCatalogSchema } from "./catalog";

describe("ProductCatalogSchema", () => {
  const catalog = {
    revision: "catalog-revision",
    materials: [],
    products: [],
    productGroups: [],
    threadColors: [
      {
        id: "feher",
        label: "Fehér",
        appearance: { kind: "hex", value: "#FFFFFF" },
      },
    ],
  };

  it("accepts a complete catalogue aggregate", () => {
    expect(ProductCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  it("rejects an unknown property", () => {
    expect(ProductCatalogSchema.safeParse({ ...catalog, extra: true }).success).toBe(false);
  });

  it("requires a catalogue revision", () => {
    expect(ProductCatalogSchema.safeParse({ ...catalog, revision: undefined }).success).toBe(false);
  });
});
