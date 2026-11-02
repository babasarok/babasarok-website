import { describe, expect, it } from "vitest";
import type { ProductDefinitionInput } from "@babasarok/product-definition";
import { validateProductDefinition } from "./product-definition";

const MATERIALS = new Set(["wellsoft", "velur"]);

function definition(overrides: Partial<ProductDefinitionInput> = {}): ProductDefinitionInput {
  return {
    id: "teszt-termek",
    orderable: true,
    basePrice: 1000,
    pricing: { kind: "unit" },
    fields: [],
    forbiddenMaterialCombinations: [],
    ...overrides,
  };
}

function choice(
  id: string,
  options: Array<{ id: string; price: number }>,
  overrides: Partial<Extract<ProductDefinitionInput["fields"][number], { kind: "choice" }>> = {}
): ProductDefinitionInput["fields"][number] {
  return {
    kind: "choice",
    id,
    label: { hu: id },
    presentation: "select",
    visibility: { kind: "always" },
    options: options.map((option) => ({ ...option, label: { hu: option.id } })),
    ...overrides,
  };
}

function materialField(
  id: string,
  options: Array<{ materialId: string; price: number }>,
  overrides: Partial<Extract<ProductDefinitionInput["fields"][number], { kind: "material" }>> = {}
): ProductDefinitionInput["fields"][number] {
  return {
    kind: "material",
    id,
    label: { hu: id },
    options,
    colorCount: { kind: "fixed", count: 1 },
    ...overrides,
  };
}

describe("validateProductDefinition", () => {
  it("rejects a duplicate option id within a choice field", () => {
    const result = validateProductDefinition(
      definition({
        fields: [
          choice("meret", [
            { id: "kicsi", price: 0 },
            { id: "kicsi", price: 500 },
          ]),
        ],
      }),
      MATERIALS
    );

    expect(result).toEqual({
      success: false,
      errors: ['meret: duplikált opciókód: "kicsi".'],
    });
  });

  it("rejects the same material twice in one material field", () => {
    const result = validateProductDefinition(
      definition({
        fields: [
          materialField("homeganyag", [
            { materialId: "wellsoft", price: 0 },
            { materialId: "wellsoft", price: 500 },
          ]),
        ],
      }),
      MATERIALS
    );

    expect(result).toEqual({
      success: false,
      errors: ['homeganyag: duplikált anyag: "wellsoft".'],
    });
  });

  it("judges option id uniqueness per field, not per definition", () => {
    const result = validateProductDefinition(
      definition({
        fields: [
          choice("meret", [{ id: "kicsi", price: 0 }]),
          choice("szin", [{ id: "kicsi", price: 0 }]),
        ],
      }),
      MATERIALS
    );

    expect(result.success).toBe(true);
  });

  it("rejects an orderable product whose only configuration prices at 0 Ft", () => {
    const result = validateProductDefinition(definition({ basePrice: 0 }), MATERIALS);

    expect(result).toEqual({
      success: false,
      errors: ["teszt-termek: A termék 0 Ft-ért adható el: nincs opció."],
    });
  });

  it("accepts a 0 Ft base price carried by priced required selections", () => {
    const result = validateProductDefinition(
      definition({ basePrice: 0, fields: [choice("meret", [{ id: "kicsi", price: 500 }])] }),
      MATERIALS
    );

    expect(result.success).toBe(true);
  });

  it("rejects a reachable 0 Ft option among priced ones", () => {
    const result = validateProductDefinition(
      definition({
        basePrice: 0,
        fields: [
          choice("meret", [
            { id: "ingyen", price: 0 },
            { id: "dragabb", price: 500 },
          ]),
        ],
      }),
      MATERIALS
    );

    expect(result).toEqual({
      success: false,
      errors: ["teszt-termek: A termék 0 Ft-ért adható el: meret=ingyen."],
    });
  });

  it("counts a custom choice value as a 0 Ft selection", () => {
    const result = validateProductDefinition(
      definition({
        basePrice: 0,
        fields: [
          choice("felirat", [{ id: "fix", price: 500 }], {
            customValue: { placeholder: { hu: "..." } },
          }),
        ],
      }),
      MATERIALS
    );

    expect(result).toEqual({
      success: false,
      errors: ["teszt-termek: A termék 0 Ft-ért adható el: felirat=__custom__."],
    });
  });

  it("skips optional states: toggle off and disabled embroidery leave the sum at 0", () => {
    const toggle: ProductDefinitionInput["fields"][number] = {
      kind: "toggle",
      id: "csomagolas",
      label: { hu: "Csomagolás" },
      visibility: { kind: "always" },
      price: 500,
    };
    const embroidery: ProductDefinitionInput["fields"][number] = {
      kind: "embroidery",
      id: "hímzés",
      label: { hu: "Hímzés" },
      visibility: { kind: "always" },
      pricing: { kind: "flat", price: 500 },
    };
    const result = validateProductDefinition(
      definition({ basePrice: 0, fields: [toggle, embroidery] }),
      MATERIALS
    );

    expect(result).toEqual({
      success: false,
      errors: ["teszt-termek: A termék 0 Ft-ért adható el: nincs opció."],
    });
  });

  it("judges a length-priced product by its per-meter price", () => {
    const result = validateProductDefinition(
      definition({
        basePrice: 0,
        pricing: { kind: "length", sourceFieldId: "hossz" },
        fields: [
          {
            kind: "input",
            id: "hossz",
            label: { hu: "Hossz" },
            visibility: { kind: "always" },
            required: true,
            price: 500,
          },
          materialField("anyag", [
            { materialId: "wellsoft", price: 0 },
            { materialId: "velur", price: 500 },
          ]),
        ],
      }),
      MATERIALS
    );

    expect(result).toEqual({
      success: false,
      errors: ["teszt-termek: A termék 0 Ft-ért adható el: anyag=wellsoft."],
    });
  });

  it("prices a length product above 0 Ft when every material is priced", () => {
    const result = validateProductDefinition(
      definition({
        basePrice: 0,
        pricing: { kind: "length", sourceFieldId: "hossz" },
        fields: [
          {
            kind: "input",
            id: "hossz",
            label: { hu: "Hossz" },
            visibility: { kind: "always" },
            required: true,
            price: 0,
          },
          materialField("anyag", [
            { materialId: "wellsoft", price: 300 },
            { materialId: "velur", price: 500 },
          ]),
        ],
      }),
      MATERIALS
    );

    expect(result.success).toBe(true);
  });

  it("respects depends_on visibility when hunting a 0 Ft configuration", () => {
    const result = validateProductDefinition(
      definition({
        basePrice: 0,
        fields: [
          choice("alap", [
            { id: "ingyenes", price: 0 },
            { id: "draga", price: 0 },
          ]),
          choice("kieg", [{ id: "extra", price: 100 }], {
            visibility: { kind: "when-equal", fieldId: "alap", value: "draga" },
          }),
        ],
      }),
      MATERIALS
    );

    expect(result).toEqual({
      success: false,
      errors: ["teszt-termek: A termék 0 Ft-ért adható el: alap=ingyenes."],
    });
  });

  it("prunes material picks that would complete a forbidden combination", () => {
    const result = validateProductDefinition(
      definition({
        basePrice: 0,
        fields: [
          materialField("homeganyag", [{ materialId: "wellsoft", price: 0 }]),
          materialField("testanyag", [{ materialId: "velur", price: 0 }]),
        ],
        forbiddenMaterialCombinations: [["wellsoft", "velur"]],
      }),
      MATERIALS
    );

    expect(result.success).toBe(true);
  });

  it("exempts non-orderable products from the 0 Ft rule", () => {
    const result = validateProductDefinition(
      definition({ basePrice: 0, orderable: false }),
      MATERIALS
    );

    expect(result.success).toBe(true);
  });
});
