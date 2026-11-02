import {
  ProductDefinitionSchema,
  ProductGroupDefinitionSchema,
} from "@babasarok/product-definition";
import { productRevision } from "@babasarok/product-definition/node";
import { describe, expect, it } from "vitest";
import {
  definitionFromTinaProduct,
  displayFromTinaProduct,
  groupDefinitionFromTinaProductGroup,
  slugFromPath,
  type TinaProduct,
  type TinaProductGroup,
} from "./tina-source";

const babafeszek: TinaProduct = {
  product_id: "babafeszek",
  title: "Babafészek",
  can_be_ordered: true,
  type: "babafeszek",
  price: 15_000,
  length_based_pricing: null,
  materials: {
    banned_combinations: [
      {
        materials: [
          { material_path: "src/content/material/wellsoft.md" },
          { material_path: "src/content/material/wellsoft.md" },
        ],
      },
    ],
  },
  fields: [
    {
      name: "meret",
      label: "Méret",
      type: "radio",
      price: 0,
      items: [
        { value: "35x65", label: "Normál", price: 0, tooltip: "35x65cm" },
        { value: "40x75", label: "Közepes", price: 1500, tooltip: null },
      ],
    },
    { name: "betet", label: "Betét", type: "toggle", price: 3700 },
    { name: "himzes", label: "Hímzés", type: "embroidery", price: 1500, price_unit: "word" },
    { name: "fodor", label: " Fodorral kérem ", type: "toggle", price: 4000 },
    {
      name: "anyag1",
      label: "Anyag 1",
      type: "material",
      color_count: "1",
      materials: [
        { material_path: "src/content/material/teddy.md", price: 0 },
        { material_path: "src/content/material/waffle.md", price: null },
      ],
    },
    {
      name: "nev",
      label: "Név",
      type: "input",
      optional: true,
      price: 0,
      placeholder: "Név",
      regex: "^[a-z]+$",
    },
  ],
};

describe("slugFromPath", () => {
  it("maps Tina material paths to canonical material ids", () => {
    expect(slugFromPath("src/content/material/wellsoft.md")).toBe("wellsoft");
    expect(slugFromPath("wellsoft.md")).toBe("wellsoft");
  });
});

describe("definitionFromTinaProduct", () => {
  it("maps the specimen product's frontmatter onto the canonical schema", () => {
    const result = definitionFromTinaProduct(babafeszek);

    if (!result.success) {
      throw new Error(JSON.stringify(result.errors));
    }

    expect(
      ProductDefinitionSchema.safeParse({ ...result.definition, revision: "rev" }).success
    ).toBe(true);
    expect(result.definition.label).toBe("Babafészek");
    expect(result.definition.pricing).toEqual({ kind: "unit" });
    expect(result.definition.orderable).toBe(true);
    expect(result.definition.hiddenInProductList).toBe(false);
    expect(result.definition.basePrice).toBe(15_000);
    expect(result.definition.forbiddenMaterialCombinations).toEqual([["wellsoft", "wellsoft"]]);
  });

  it("carries hidden_in_product_list onto the definition", () => {
    const result = definitionFromTinaProduct({
      ...babafeszek,
      product_id: "kedvezmenyes-termekek",
      hidden_in_product_list: true,
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.definition.hiddenInProductList).toBe(true);
  });

  it("trims untrimmed labels and maps field kinds onto canonical members", () => {
    const result = definitionFromTinaProduct(babafeszek);

    if (!result.success) {
      throw new Error(JSON.stringify(result.errors));
    }

    const [meret, betet, himzes, fodor, anyag1, nev] = result.definition.fields;

    expect(meret).toMatchObject({
      kind: "choice",
      id: "meret",
      presentation: "radio",
      options: [
        { id: "35x65", label: "Normál", price: 0, tooltip: "35x65cm" },
        { id: "40x75", label: "Közepes", price: 1500 },
      ],
    });
    expect(betet).toMatchObject({ kind: "toggle", id: "betet", price: 3700 });
    expect(himzes).toMatchObject({
      kind: "embroidery",
      pricing: { kind: "per-word", pricePerWord: 1500 },
    });
    expect(fodor).toMatchObject({ kind: "toggle", id: "fodor", label: "Fodorral kérem" });
    expect(anyag1).toMatchObject({
      kind: "material",
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "teddy", price: 0 },
        { materialId: "waffle", price: 0 },
      ],
    });
    expect(nev).toMatchObject({
      kind: "input",
      required: false,
      placeholder: "Név",
      pattern: "^[a-z]+$",
    });
  });

  it("maps length pricing and absent ordering flags", () => {
    const result = definitionFromTinaProduct({
      ...babafeszek,
      product_id: "racsvedo",
      title: "Rácsvédő",
      type: "racsvedo",
      can_be_ordered: null,
      price: 0,
      length_based_pricing: { sourceField: "sizes" },
      materials: null,
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.definition.pricing).toEqual({ kind: "length", sourceFieldId: "sizes" });
    expect(result.definition.orderable).toBe(false);
    expect(result.definition.forbiddenMaterialCombinations).toEqual([]);
  });

  it("rejects unknown product and field types with issues", () => {
    const result = definitionFromTinaProduct({
      ...babafeszek,
      type: "ismeretlen",
      fields: [
        ...(babafeszek.fields ?? []),
        { name: "idegen", label: "Idegen", type: "idegen", price: 0 },
      ],
    });

    expect(result.success).toBe(false);

    if (result.success) {
      return;
    }

    expect(result.errors).toEqual([
      'babafeszek: Ismeretlen termék típus: "ismeretlen".',
      'idegen: Ismeretlen mező típus: "idegen".',
    ]);
  });

  it("derives a stable revision from the commerce-relevant facts", () => {
    const first = definitionFromTinaProduct(babafeszek);
    const second = definitionFromTinaProduct(babafeszek);

    if (!first.success || !second.success) {
      throw new Error("fixtures must parse");
    }

    const repriced = definitionFromTinaProduct({
      ...babafeszek,
      price: 16_000,
    });

    expect(productRevision(first.definition)).toBe(productRevision(second.definition));

    if (!repriced.success) {
      throw new Error("reprice fixture must parse");
    }

    expect(productRevision(repriced.definition)).not.toBe(productRevision(first.definition));
  });
});

describe("displayFromTinaProduct", () => {
  it("maps the display frontmatter onto the custom-field payload", () => {
    const display = displayFromTinaProduct({
      ...babafeszek,
      date: "2025-04-20T12:07:16.000Z",
      thumbnail: "/src/assets/Noémi-41.webp",
      images: [
        { image: "/src/assets/IMG_6490.jpeg", description: " Hamvas rózsa " },
        { image: "/src/assets/IMG_6601.jpeg", description: null },
        null,
      ],
      categories: " A nyugodt alvás titka ",
      shortDescription: "Univerzális takaró és párna minden évszakra ",
      icon: null,
    });

    expect(display).toEqual({
      shortDescription: "Univerzális takaró és párna minden évszakra",
      tagline: "A nyugodt alvás titka",
      date: "2025-04-20T12:07:16.000Z",
      thumbnailPath: "/src/assets/Noémi-41.webp",
      gallery: [
        { imagePath: "/src/assets/IMG_6490.jpeg", description: "Hamvas rózsa" },
        { imagePath: "/src/assets/IMG_6601.jpeg", description: null },
      ],
      iconPath: null,
    });
  });

  it("nulls absent display content", () => {
    expect(displayFromTinaProduct(babafeszek)).toEqual({
      shortDescription: null,
      tagline: null,
      date: null,
      thumbnailPath: null,
      gallery: [],
      iconPath: null,
    });
  });
});

describe("groupDefinitionFromTinaProductGroup", () => {
  const ovisSzett: TinaProductGroup = {
    title: "Ovis szett",
    discount_amount: 1300,
    products: [
      { product: "src/content/product/tornazsak.md" },
      { product: "src/content/product/vallfas-zsak.md" },
    ],
  };
  const productIdByFile = new Map([
    ["tornazsak", "tornazsak"],
    ["vallfas-zsak", "vallfas-zsak"],
  ]);

  it("maps a discounted set onto the canonical schema", () => {
    const result = groupDefinitionFromTinaProductGroup(ovisSzett, "ovis-szett", productIdByFile);

    if (!result.success) {
      throw new Error(result.errors.join("; "));
    }

    expect(ProductGroupDefinitionSchema.safeParse(result.group).success).toBe(true);
    expect(result.group).toEqual({
      kind: "discounted-set",
      id: "ovis-szett",
      label: "Ovis szett",
      discount: 1300,
      productIds: ["tornazsak", "vallfas-zsak"],
    });
  });

  it("maps a zero discount onto related items", () => {
    const result = groupDefinitionFromTinaProductGroup(
      { ...ovisSzett, discount_amount: 0 },
      "ovis-felszereles",
      productIdByFile
    );

    if (!result.success) {
      throw new Error(result.errors.join("; "));
    }

    expect(result.group).toMatchObject({ kind: "related-items", id: "ovis-felszereles" });
    expect("discount" in result.group).toBe(false);
  });

  it("rejects member references no seeded product file satisfies", () => {
    const result = groupDefinitionFromTinaProductGroup(
      { ...ovisSzett, products: [{ product: "src/content/product/hianyzik.md" }] },
      "ovis-szett",
      productIdByFile
    );

    expect(result.success).toBe(false);

    if (result.success) {
      return;
    }

    expect(result.errors).toEqual([
      "Ismeretlen termék hivatkozás: src/content/product/hianyzik.md",
    ]);
  });
});
