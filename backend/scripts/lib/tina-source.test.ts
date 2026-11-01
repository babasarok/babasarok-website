import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import {
  definitionFromTinaProduct,
  materialSlugFromPath,
  productRevision,
  type TinaProduct,
} from "./tina-source";

const babafeszek: TinaProduct = {
  product_id: "babafeszek",
  title: "Babafészek",
  can_be_ordered: true,
  type: "babafeszek",
  price: 15_000,
  discount: null,
  discount_valid_until: null,
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

describe("materialSlugFromPath", () => {
  it("maps Tina material paths to canonical material ids", () => {
    expect(materialSlugFromPath("src/content/material/wellsoft.md")).toBe("wellsoft");
    expect(materialSlugFromPath("wellsoft.md")).toBe("wellsoft");
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
    expect(result.definition.basePrice).toBe(15_000);
    expect(result.definition.forbiddenMaterialCombinations).toEqual([["wellsoft", "wellsoft"]]);
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
