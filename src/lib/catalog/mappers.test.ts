import type { z } from "zod";
import { describe, expect, it } from "vitest";
import product from "./__fixtures__/product.json";
import products from "./__fixtures__/products.json";
import { toProduct, toProductDetail } from "./mappers";
import { ProductResponseSchema, ProductsResponseSchema } from "./schemas";

// Seam: the shop API's product row vs. the storefront's CatalogProduct —
// which products are listed, and whether they are configured or ready-made.

type ProductRow = z.output<typeof ProductsResponseSchema>["products"]["items"][number];
type DetailRow = NonNullable<z.output<typeof ProductResponseSchema>["product"]>;

function listRow(overrides: Record<string, unknown>): ProductRow {
  const response = {
    ...products,
    products: { ...products.products, items: [{ ...products.products.items[0], ...overrides }] },
  };

  return ProductsResponseSchema.parse(response).products.items[0];
}

function detailRow(overrides: Record<string, unknown>): DetailRow {
  const row = ProductResponseSchema.parse({
    product: { ...product.product, ...overrides },
  }).product;

  if (row === null) {
    throw new Error("fixture product row is null");
  }

  return row;
}

const readyMadeVariant = { currencyCode: "HUF", priceWithTax: 6500, stockLevel: "IN_STOCK" };

describe("toProduct", () => {
  it("maps a definition-backed product to the configurable ordering", () => {
    expect(toProduct(listRow({}))?.ordering).toMatchObject({ kind: "configurable" });
  });

  it("maps a definition-less product to its variant price", () => {
    const product = toProduct(
      listRow({ slug: "kesz-kanal", productDefinition: null, variants: [readyMadeVariant] })
    );

    expect(product).toMatchObject({
      slug: "kesz-kanal",
      ordering: { kind: "ready-made", unitPriceWithTax: 6500, currencyCode: "HUF" },
    });
  });

  it("keeps a low-stock ready-made product listed but hides a sold-out one", () => {
    const base = { slug: "kesz-kanal", productDefinition: null };

    expect(
      toProduct(listRow({ ...base, variants: [{ ...readyMadeVariant, stockLevel: "LOW_STOCK" }] }))
        ?.ordering
    ).toMatchObject({ kind: "ready-made" });
    expect(
      toProduct(
        listRow({ ...base, variants: [{ ...readyMadeVariant, stockLevel: "OUT_OF_STOCK" }] })
      )
    ).toBeNull();
  });

  it("hides a definition-less product without a variant", () => {
    expect(
      toProduct(listRow({ slug: "kesz-kanal", productDefinition: null, variants: [] }))
    ).toBeNull();
  });
});

describe("toProductDetail", () => {
  it("carries the detail fields of a ready-made product", () => {
    const detail = toProductDetail(
      detailRow({ productDefinition: null, variants: [readyMadeVariant] })
    );

    expect(detail).toMatchObject({
      ordering: { kind: "ready-made", unitPriceWithTax: 6500, currencyCode: "HUF" },
      description: "**Tornazsák** leírása",
    });
    expect(detail?.gallery.length).toBeGreaterThan(0);
  });

  it("is null for a sold-out ready-made product", () => {
    expect(
      toProductDetail(
        detailRow({
          productDefinition: null,
          variants: [{ ...readyMadeVariant, stockLevel: "OUT_OF_STOCK" }],
        })
      )
    ).toBeNull();
  });
});
