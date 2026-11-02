/**
 * Unit tests for the configurator editor's pure logic (the transforms the
 * 60-second browser e2e only exercises through the UI). The canonical schema
 * is the authority these helpers must satisfy, so the assertions validate
 * against it where a shape matters.
 */
import { describe, expect, test } from "vitest";
import { ProductDefinitionSchema } from "@babasarok/product-definition";
import {
  assignGeneratedIds,
  carryOver,
  hasEditableData,
  newDefinition,
  newField,
  sanitize,
  slugifyLabel,
  type ChoiceFieldInput,
  type ChoiceOptionInput,
} from "./product-definition-editor";

describe("newField", () => {
  test("choice fields default to a select with one empty option", () => {
    const field = newField("choice", "szin", "Szín");

    expect(field).toEqual({
      id: "szin",
      label: "Szín",
      kind: "choice",
      presentation: "select",
      visibility: { kind: "always" },
      options: [{ id: "", label: "", price: 0 }],
    });
  });

  test("every kind starts from its canonical defaults", () => {
    expect(newField("toggle", "a", "A")).toEqual({
      id: "a",
      label: "A",
      kind: "toggle",
      visibility: { kind: "always" },
      price: 0,
    });
    expect(newField("material", "a", "A")).toEqual({
      id: "a",
      label: "A",
      kind: "material",
      options: [],
      colorCount: { kind: "fixed", count: 1 },
    });
    expect(newField("input", "a", "A")).toEqual({
      id: "a",
      label: "A",
      kind: "input",
      visibility: { kind: "always" },
      required: true,
      price: 0,
    });
    expect(newField("embroidery", "a", "A")).toEqual({
      id: "a",
      label: "A",
      kind: "embroidery",
      visibility: { kind: "always" },
      pricing: { kind: "per-word", pricePerWord: 0 },
    });
  });
});

describe("hasEditableData", () => {
  test("a fresh row is bare defaults regardless of kind", () => {
    for (const kind of ["choice", "toggle", "material", "input", "embroidery"] as const) {
      expect(hasEditableData(newField(kind, "", ""))).toBe(false);
    }
  });

  test("id and label alone are not editable data — they survive a kind switch", () => {
    expect(hasEditableData(newField("choice", "szin", "Szín"))).toBe(false);
  });

  test("any edited value counts as data a kind switch would discard", () => {
    const pricedOption = newField("choice", "", "");

    if (pricedOption.kind === "choice") {
      pricedOption.options[0].price = 500;
      expect(hasEditableData(pricedOption)).toBe(true);
    }

    const optionalInput = newField("input", "", "");

    if (optionalInput.kind === "input") {
      optionalInput.required = false;
      expect(hasEditableData(optionalInput)).toBe(true);
    }

    const extraMaterial = newField("material", "", "");

    if (extraMaterial.kind === "material") {
      extraMaterial.options.push({ materialId: "e2e-pamut", price: 0 });
      expect(hasEditableData(extraMaterial)).toBe(true);
    }
  });
});

describe("carryOver", () => {
  test("passes tooltip and visibility across a non-material switch", () => {
    const previous = newField("choice", "szin", "Szín");

    if (previous.kind === "choice") {
      previous.tooltip = "Válassz színt";
      previous.visibility = { kind: "when-present", fieldId: "ajandek" };
    }

    const next = carryOver(newField("toggle", "szin", "Szín"), previous);

    expect(next.kind).toBe("toggle");
    expect(next.tooltip).toBe("Válassz színt");

    if (next.kind === "toggle") {
      expect(next.visibility).toEqual({ kind: "when-present", fieldId: "ajandek" });
    }
  });

  test("a material target keeps its own (empty) tooltip and visibility", () => {
    const previous = newField("toggle", "a", "A");
    previous.tooltip = "Kapcsold be";

    const next = carryOver(newField("material", "a", "A"), previous);

    expect(next).toEqual(newField("material", "a", "A"));
  });

  test("switching from a material keeps the target's own visibility", () => {
    const next = carryOver(newField("input", "a", "A"), newField("material", "a", "A"));

    if (next.kind === "input") {
      expect(next.visibility).toEqual({ kind: "always" });
    }
  });
});

describe("sanitize", () => {
  test("trims ids, labels, material references and forbidden pairs", () => {
    const definition = newDefinition("  e2e-x  ");
    definition.fields = [
      newField("choice", " szin ", " Szín "),
      newField("material", " anyag ", " Anyag "),
    ];

    const choice = definition.fields[0];
    if (choice.kind === "choice") {
      choice.options = [{ id: " kek ", label: " Kék ", price: 0 }];
    }

    const material = definition.fields[1];
    if (material.kind === "material") {
      material.options = [{ materialId: " e2e-pamut ", price: 0 }];
    }

    definition.forbiddenMaterialCombinations = [[" e2e-pamut ", " e2e-vaszon "]];

    const cleaned = sanitize(definition);

    expect(cleaned.fields[0].id).toBe("szin");
    expect(cleaned.fields[0].label).toBe("Szín");

    if (cleaned.fields[0].kind === "choice") {
      expect(cleaned.fields[0].options[0]).toEqual({ id: "kek", label: "Kék", price: 0 });
    }

    if (cleaned.fields[1].kind === "material") {
      expect(cleaned.fields[1].options[0]).toEqual({ materialId: "e2e-pamut", price: 0 });
    }

    expect(cleaned.forbiddenMaterialCombinations).toEqual([["e2e-pamut", "e2e-vaszon"]]);
  });

  test("a sanitized fresh definition passes the canonical schema", () => {
    const definition = sanitize(newDefinition("e2e-x"));

    expect(ProductDefinitionSchema.safeParse(definition).success).toBe(true);
  });
});

describe("newDefinition", () => {
  test("starts orderable, unit-priced and empty", () => {
    expect(newDefinition("e2e-x")).toEqual({
      id: "e2e-x",
      orderable: true,
      basePrice: 0,
      pricing: { kind: "unit" },
      fields: [],
      forbiddenMaterialCombinations: [],
    });
  });
});

describe("slugifyLabel", () => {
  test.each([
    ["Szín", "szin"],
    ["Méret (cm)", "meret-cm"],
    ["Ajándék csomagolás", "ajandek-csomagolas"],
    ["  -", ""],
  ])("%j → %j", (label, expected) => {
    expect(slugifyLabel(label)).toBe(expected);
  });
});

describe("assignGeneratedIds", () => {
  const choiceField = (
    id: string,
    label: string,
    options: ChoiceOptionInput[]
  ): ChoiceFieldInput => ({
    id,
    label,
    kind: "choice",
    presentation: "select",
    visibility: { kind: "always" },
    options,
  });

  test("derives field and option codes from the labels", () => {
    const definition = assignGeneratedIds({
      ...newDefinition("p"),
      fields: [
        choiceField("", "Szín", [
          { id: "", label: "Kék", price: 0 },
          { id: "", label: "Piros", price: 0 },
        ]),
        newField("toggle", "", "Ajándék csomagolás"),
      ],
    });

    expect(definition.fields.map((field) => field.id)).toEqual(["szin", "ajandek-csomagolas"]);
    const choice = definition.fields[0];
    if (choice.kind !== "choice") {
      throw new Error("expected the first field to stay a choice");
    }

    expect(choice.options.map((option) => option.id)).toEqual(["kek", "piros"]);
  });

  test("deduplicates generated codes and keeps explicit ones untouched", () => {
    const definition = assignGeneratedIds({
      ...newDefinition("p"),
      fields: [
        newField("toggle", "meret", "Első"),
        newField("toggle", "", "Méret"),
        newField("toggle", "", "Méret"),
        choiceField("szin", "Szín", [
          { id: "kek", label: "Kék", price: 0 },
          { id: "", label: "Kék", price: 0 },
          { id: "", label: "", price: 0 },
        ]),
      ],
    });

    expect(definition.fields.map((field) => field.id)).toEqual([
      "meret",
      "meret-2",
      "meret-3",
      "szin",
    ]);
    const choice = definition.fields[3];
    if (choice.kind !== "choice") {
      throw new Error("expected the fourth field to stay a choice");
    }

    expect(choice.options.map((option) => option.id)).toEqual(["kek", "kek-2", "opcio"]);
  });

  test("the output still satisfies the canonical schema", () => {
    const definition = assignGeneratedIds(
      sanitize({
        ...newDefinition("p"),
        fields: [choiceField("", "Szín", [{ id: "", label: "Kék", price: 0 }])],
      })
    );

    expect(ProductDefinitionSchema.safeParse(definition).success).toBe(true);
  });
});
