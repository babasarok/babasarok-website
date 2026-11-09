import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import { instantiateProduct } from "@/lib/order/product";
import type { IProduct } from "@/lib/types.svelte";
import { liveUnitPrice } from "./livePrice";
import { toOrderGroups, toOrderProduct } from "./orderProduct";
import type { CatalogMaterial, CatalogProduct } from "./mappers";

const BASE = "https://api.example/assets/";

const definition = ProductDefinitionSchema.parse({
  id: "kosar",
  basePrice: 1000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [["a", "b"]],
  fields: [
    {
      id: "meret",
      kind: "choice",
      presentation: "select",
      label: { hu: "Méret" },
      visibility: { kind: "always" },
      options: [
        { id: "kicsi", label: { hu: "Kicsi" }, price: 0 },
        { id: "nagy", label: { hu: "Nagy" }, price: 500 },
      ],
    },
    {
      id: "csik",
      kind: "toggle",
      label: { hu: "Csík" },
      visibility: { kind: "when-equal", fieldId: "meret", value: "nagy" },
      price: 200,
    },
    {
      id: "himzes",
      kind: "embroidery",
      label: { hu: "Hímzés" },
      visibility: { kind: "always" },
      pricing: { kind: "per-word", pricePerWord: 100 },
    },
    {
      id: "anyag",
      kind: "material",
      label: { hu: "Anyag" },
      options: [
        { materialId: "a", price: 0 },
        { materialId: "b", price: 300 },
      ],
      colorCount: { kind: "fixed", count: 1 },
    },
  ],
});

const materials: CatalogMaterial[] = [
  {
    slug: "a",
    label: "A",
    subtitle: "",
    description: "",
    thumbnailUrl: null,
    colors: [{ id: "piros", label: "Piros", hex: "#ff0000", imageUrl: null }],
  },
];

const catalogProduct: CatalogProduct = {
  id: "1",
  slug: "kosar",
  name: "Kosár",
  tagline: "Alcím",
  shortDescription: null,
  date: "2026-01-02T00:00:00.000Z",
  popularityRank: null,
  thumbnailUrl: "source/ab/kosar.jpg",
  type: { code: "zsak", name: "Zsák" },
  definition,
};

function configured(): IProduct {
  return instantiateProduct(toOrderProduct(catalogProduct, materials, BASE, "hu"));
}

describe("toOrderProduct", () => {
  it("maps the definition onto the configurator's product shape", () => {
    const product = toOrderProduct(catalogProduct, materials, BASE, "hu");

    expect(product).toMatchObject({
      product_id: "kosar",
      title: "Kosár",
      can_be_ordered: true,
      price: 1000,
      type: "zsak",
      categories: "Alcím",
    });
    expect(product.fields?.map((field) => field?.type)).toEqual([
      "select",
      "toggle",
      "embroidery",
      "material",
    ]);
    expect(product.fields?.[1]?.depends_on).toEqual({ field: "meret", value: "nagy" });
    expect(product.thumbnail?.src).toContain("preset=card-lg");
  });

  it("offers only materials the catalog knows", () => {
    const material = toOrderProduct(catalogProduct, materials, BASE, "hu").fields?.[3];

    expect(material?.materials?.map((option) => option?.material_path.material_id)).toEqual(["a"]);
  });

  it("resolves the definition text in the requested language", () => {
    const bilingual = ProductDefinitionSchema.parse({
      id: "kosar",
      basePrice: 1000,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [
        {
          id: "meret",
          kind: "choice",
          presentation: "select",
          label: { hu: "Méret", en: "Size" },
          visibility: { kind: "always" },
          options: [{ id: "kicsi", label: { hu: "Kicsi", en: "Small" }, price: 0 }],
        },
      ],
    });

    const hu = toOrderProduct({ ...catalogProduct, definition: bilingual }, materials, BASE, "hu");
    const en = toOrderProduct({ ...catalogProduct, definition: bilingual }, materials, BASE, "en");

    expect(hu.fields?.[0]?.label).toBe("Méret");
    expect(en.fields?.[0]?.label).toBe("Size");
    expect(hu.fields?.[0]?.items?.[0]?.label).toBe("Kicsi");
    expect(en.fields?.[0]?.items?.[0]?.label).toBe("Small");
  });
});

describe("toOrderGroups", () => {
  it("keeps the discount only on sets", () => {
    const groups = toOrderGroups([
      { id: "1", kind: "set", label: "Szett", discount: 1000, productIds: ["a", "b"] },
      { id: "2", kind: "related", label: "Kapcsolódó", discount: null, productIds: ["a"] },
    ]);

    expect(groups.map((group) => group.discount_amount)).toEqual([1000, undefined]);
    expect(groups[0]?.products).toEqual([{ product_id: "a" }, { product_id: "b" }]);
  });
});

describe("liveUnitPrice", () => {
  it("prices unpicked options at the first listed option", () => {
    expect(liveUnitPrice(definition, "Kosár", configured())).toBe(1000);
  });

  it("adds the picked option, the visible toggle and per-word embroidery", () => {
    const item = configured();

    for (const field of item.fields) {
      if (field.type === "select") {
        field.value = { value: "nagy" };
      }

      if (field.type === "toggle") {
        field.value = { value: true };
      }

      if (field.type === "embroidery") {
        field.value = { enabled: true, text: { value: "két szó" }, color: { color: "x" } };
      }

      if (field.type === "material") {
        field.value = { material_id: "b", colors: ["piros"] };
      }
    }

    expect(liveUnitPrice(definition, "Kosár", item)).toBe(1000 + 500 + 200 + 300 + 200);
  });

  it("ignores a toggle hidden by its visibility", () => {
    const item = configured();

    for (const field of item.fields) {
      if (field.type === "toggle") {
        field.value = { value: true };
      }
    }

    expect(liveUnitPrice(definition, "Kosár", item)).toBe(1000);
  });

  it("is unpriceable for a length product until a length is entered", () => {
    const lengthDefinition = ProductDefinitionSchema.parse({
      id: "szalag",
      basePrice: 2000,
      pricing: { kind: "length", sourceFieldId: "hossz" },
      forbiddenMaterialCombinations: [],
      fields: [
        {
          id: "hossz",
          kind: "input",
          label: { hu: "Hossz" },
          visibility: { kind: "always" },
          required: true,
          price: 0,
        },
      ],
    });
    const item = instantiateProduct(
      toOrderProduct({ ...catalogProduct, definition: lengthDefinition }, materials, BASE, "hu")
    );

    expect(liveUnitPrice(lengthDefinition, "Szalag", item)).toBeNull();

    for (const field of item.fields) {
      if (field.type === "input") {
        field.value = { value: "150" };
      }
    }

    expect(liveUnitPrice(lengthDefinition, "Szalag", item)).toBe(3000);
  });
});
