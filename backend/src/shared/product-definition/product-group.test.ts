import { describe, expect, it } from "vitest";
import { ProductGroupDefinitionSchema } from "./product-group";

describe("ProductGroupDefinitionSchema", () => {
  const discountedSet = {
    kind: "discounted-set",
    id: "akcios-keszlet",
    label: "Akciós készlet",
    discount: 500,
    productIds: ["termek-1", "termek-2"],
  };
  const relatedItems = {
    kind: "related-items",
    id: "osszetartozo",
    label: "Összetartozó",
    productIds: ["termek-1", "termek-2"],
  };

  it("accepts both members", () => {
    expect(ProductGroupDefinitionSchema.safeParse(discountedSet).success).toBe(true);
    expect(ProductGroupDefinitionSchema.safeParse(relatedItems).success).toBe(true);
  });

  it.each([0, -1, 1.5])("rejects the discount %s", (discount) => {
    expect(ProductGroupDefinitionSchema.safeParse({ ...discountedSet, discount }).success).toBe(
      false
    );
  });

  it("rejects a discount property on related items", () => {
    expect(ProductGroupDefinitionSchema.safeParse({ ...relatedItems, discount: 500 }).success).toBe(
      false
    );
  });

  it.each([
    ["the discounted set", { ...discountedSet, productIds: ["termek-1"] }],
    ["related items", { ...relatedItems, productIds: ["termek-1"] }],
  ])("rejects fewer than two productIds in %s", (_description, source) => {
    expect(ProductGroupDefinitionSchema.safeParse(source).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(
      ProductGroupDefinitionSchema.safeParse({ ...discountedSet, kind: "bundle" }).success
    ).toBe(false);
  });
});
