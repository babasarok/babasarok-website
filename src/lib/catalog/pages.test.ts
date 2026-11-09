import { describe, expect, it } from "vitest";
import materials from "./__fixtures__/materials.json";
import productGroups from "./__fixtures__/product-groups.json";
import productFixture from "./__fixtures__/product.json";
import products from "./__fixtures__/products.json";
import threadColors from "./__fixtures__/thread-colors.json";
import { toCheckoutCatalog } from "./checkoutCatalog";
import { toMaterialPageData } from "./materialPage";
import { getCatalog, type Catalog } from "./index";
import { toProductDetail } from "./mappers";
import { toProductPageData } from "./productPage";
import { ProductResponseSchema } from "./schemas";

const ASSET_BASE = "https://api.test/assets/";

async function loadCatalog(): Promise<Catalog> {
  const response = { ...products, ...materials, ...threadColors, ...productGroups };

  return getCatalog((request) => Promise.resolve(request.schema.parse(response)));
}

function tornazsak(): NonNullable<ReturnType<typeof toProductDetail>> {
  const row = ProductResponseSchema.parse(productFixture).product;
  const detail = row === null ? null : toProductDetail(row);

  if (detail === null) {
    throw new Error("fixture product must be a storefront product");
  }

  return detail;
}

describe("toProductPageData", () => {
  it("links the neighbours in newest-first order", async () => {
    const catalog = await loadCatalog();
    const page = toProductPageData(tornazsak(), catalog, "en", ASSET_BASE);
    const older = catalog.products.find((product) => product.slug === "kismama-parna");

    expect(page.previous).toBeUndefined();
    expect(page.next).toEqual({ href: "/en/product/kismama-parna/", label: older?.name });
  });

  it("offers the products sharing a group with this one to the configurator", async () => {
    const page = toProductPageData(tornazsak(), await loadCatalog(), "hu", ASSET_BASE);

    expect(Object.keys(page.orderCatalog)).toEqual(["tornazsak"]);
    expect(page.slugByProductId).toMatchObject({ "kismama-parna": "kismama-parna" });
  });

  it("falls back to the thumbnail when the product has no gallery", async () => {
    const product = { ...tornazsak(), gallery: [] };
    const page = toProductPageData(product, await loadCatalog(), "hu", ASSET_BASE);

    expect(page.gallery).toEqual([{ src: product.thumbnailUrl, alt: product.name }]);
  });
});

describe("toCheckoutCatalog", () => {
  it("names materials, their colors and thread colors by id", async () => {
    const catalog = await loadCatalog();
    const { labels } = toCheckoutCatalog(catalog);
    const [material] = catalog.materials;
    const [color] = material.colors;

    expect(labels.materials[material.slug]?.colors[color.id]).toBe(color.label);
    expect(labels.threadColors[catalog.threadColors[0].id]).toBe(catalog.threadColors[0].label);
  });
});

describe("toMaterialPageData", () => {
  it("finds the material and links its neighbours in label order", async () => {
    const { materials } = await loadCatalog();
    const [first, second] = materials.toSorted((a, b) => a.label.localeCompare(b.label, "hu"));
    const page = toMaterialPageData(materials, first.slug, "hu");

    expect(page.material?.slug).toBe(first.slug);
    expect(page.previous).toBeUndefined();
    expect(page.next).toEqual({ href: `/material/${second.slug}/`, label: second.label });
  });

  it("finds nothing for an unknown slug", async () => {
    const { materials } = await loadCatalog();

    expect(toMaterialPageData(materials, "nope", "hu")).toEqual({
      material: undefined,
      previous: undefined,
      next: undefined,
    });
  });
});
