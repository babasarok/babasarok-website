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

const readyMadeVariant = {
  id: "71",
  currencyCode: "HUF",
  priceWithTax: 6500,
  stockLevel: "IN_STOCK",
  saleableStock: 3,
  options: [],
};

const sizeGroup = {
  id: "5",
  name: "Méret",
  options: [
    { id: "51", name: "S" },
    { id: "52", name: "M" },
    { id: "53", name: "L" },
  ],
};

const smallVariant = { ...readyMadeVariant, id: "81", options: [{ id: "51" }] };
const largeVariant = {
  ...readyMadeVariant,
  id: "83",
  priceWithTax: 8000,
  saleableStock: 1,
  options: [{ id: "53" }],
};

describe("toProduct", () => {
  it("maps a definition-backed product to the configurator ordering", () => {
    expect(toProduct(listRow({}))?.ordering).toMatchObject({ kind: "configurator" });
  });

  it("maps a definition-less product to its variant price and stock", () => {
    const product = toProduct(
      listRow({ slug: "kesz-kanal", productDefinition: null, variants: [readyMadeVariant] })
    );

    expect(product).toMatchObject({
      slug: "kesz-kanal",
      ordering: {
        kind: "ready-made",
        currencyCode: "HUF",
        optionGroups: [],
        variants: [
          { id: "71", priceWithTax: 6500, saleableStock: 3, soldOut: false, optionIds: [] },
        ],
      },
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

  it("carries a null stock for an untracked ready-made variant", () => {
    expect(
      toProduct(
        listRow({
          slug: "kesz-kanal",
          productDefinition: null,
          variants: [{ ...readyMadeVariant, saleableStock: null }],
        })
      )?.ordering
    ).toMatchObject({ kind: "ready-made", variants: [{ saleableStock: null }] });
  });

  it("maps a product with options to its variants, offering only the options a variant carries", () => {
    const product = toProduct(
      listRow({
        productDefinition: null,
        optionGroups: [sizeGroup],
        variants: [smallVariant, largeVariant],
      })
    );

    expect(product?.ordering).toEqual({
      kind: "ready-made",
      currencyCode: "HUF",
      optionGroups: [
        {
          id: "5",
          name: "Méret",
          options: [
            { id: "51", name: "S" },
            { id: "53", name: "L" },
          ],
        },
      ],
      variants: [
        { id: "81", priceWithTax: 6500, saleableStock: 3, soldOut: false, optionIds: ["51"] },
        { id: "83", priceWithTax: 8000, saleableStock: 1, soldOut: false, optionIds: ["53"] },
      ],
    });
  });

  it("keeps a product with options listed while any variant is in stock, with its sold-out ones", () => {
    const soldOutSmall = { ...smallVariant, stockLevel: "OUT_OF_STOCK", saleableStock: 0 };
    const listed = toProduct(
      listRow({
        productDefinition: null,
        optionGroups: [sizeGroup],
        variants: [soldOutSmall, largeVariant],
      })
    );

    expect(listed?.ordering).toMatchObject({
      variants: [
        { id: "81", soldOut: true },
        { id: "83", soldOut: false },
      ],
    });
    expect(
      toProduct(
        listRow({
          productDefinition: null,
          optionGroups: [sizeGroup],
          variants: [soldOutSmall, { ...largeVariant, stockLevel: "OUT_OF_STOCK" }],
        })
      )
    ).toBeNull();
  });
});

describe("toProductDetail", () => {
  it("carries the detail fields of a ready-made product", () => {
    const detail = toProductDetail(
      detailRow({ productDefinition: null, variants: [readyMadeVariant] })
    );

    expect(detail).toMatchObject({
      ordering: {
        kind: "ready-made",
        currencyCode: "HUF",
        variants: [{ id: "71", priceWithTax: 6500, saleableStock: 3 }],
      },
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
