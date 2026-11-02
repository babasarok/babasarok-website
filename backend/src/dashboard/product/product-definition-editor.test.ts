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
  canUnifiedSave,
  planUnifiedSave,
  carryOver,
  hasEditableData,
  newDefinition,
  newField,
  sanitize,
  slugifyLabel,
  textPlaceholder,
  textValue,
  withText,
  type ChoiceFieldInput,
  type ChoiceOptionInput,
} from "./product-definition-editor";

describe("newField", () => {
  test("choice fields default to a select with one empty option", () => {
    const field = newField("choice", "szin", { hu: "Szín" });

    expect(field).toEqual({
      id: "szin",
      label: { hu: "Szín" },
      kind: "choice",
      presentation: "select",
      visibility: { kind: "always" },
      options: [{ id: "", label: { hu: "" }, price: 0 }],
    });
  });

  test("every kind starts from its canonical defaults", () => {
    expect(newField("toggle", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "toggle",
      visibility: { kind: "always" },
      price: 0,
    });
    expect(newField("material", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "material",
      options: [],
      colorCount: { kind: "fixed", count: 1 },
    });
    expect(newField("input", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "input",
      visibility: { kind: "always" },
      required: true,
      price: 0,
    });
    expect(newField("embroidery", "a", { hu: "A" })).toEqual({
      id: "a",
      label: { hu: "A" },
      kind: "embroidery",
      visibility: { kind: "always" },
      pricing: { kind: "per-word", pricePerWord: 0 },
    });
  });
});

describe("hasEditableData", () => {
  test("a fresh row is bare defaults regardless of kind", () => {
    for (const kind of ["choice", "toggle", "material", "input", "embroidery"] as const) {
      expect(hasEditableData(newField(kind, "", { hu: "" }))).toBe(false);
    }
  });

  test("id and label alone are not editable data — they survive a kind switch", () => {
    expect(hasEditableData(newField("choice", "szin", { hu: "Szín" }))).toBe(false);
  });

  test("any edited value counts as data a kind switch would discard", () => {
    const pricedOption = newField("choice", "", { hu: "" });

    if (pricedOption.kind === "choice") {
      pricedOption.options[0].price = 500;
      expect(hasEditableData(pricedOption)).toBe(true);
    }

    const optionalInput = newField("input", "", { hu: "" });

    if (optionalInput.kind === "input") {
      optionalInput.required = false;
      expect(hasEditableData(optionalInput)).toBe(true);
    }

    const extraMaterial = newField("material", "", { hu: "" });

    if (extraMaterial.kind === "material") {
      extraMaterial.options.push({ materialId: "e2e-pamut", price: 0 });
      expect(hasEditableData(extraMaterial)).toBe(true);
    }
  });
});

describe("carryOver", () => {
  test("passes tooltip and visibility across a non-material switch", () => {
    const previous = newField("choice", "szin", { hu: "Szín" });

    if (previous.kind === "choice") {
      previous.tooltip = { hu: "Válassz színt" };
      previous.visibility = { kind: "when-present", fieldId: "ajandek" };
    }

    const next = carryOver(newField("toggle", "szin", { hu: "Szín" }), previous);

    expect(next.kind).toBe("toggle");
    expect(next.tooltip).toEqual({ hu: "Válassz színt" });

    if (next.kind === "toggle") {
      expect(next.visibility).toEqual({ kind: "when-present", fieldId: "ajandek" });
    }
  });

  test("a material target keeps its own (empty) tooltip and visibility", () => {
    const previous = newField("toggle", "a", { hu: "A" });
    previous.tooltip = { hu: "Kapcsold be" };

    const next = carryOver(newField("material", "a", { hu: "A" }), previous);

    expect(next).toEqual(newField("material", "a", { hu: "A" }));
  });

  test("switching from a material keeps the target's own visibility", () => {
    const next = carryOver(
      newField("input", "a", { hu: "A" }),
      newField("material", "a", { hu: "A" })
    );

    if (next.kind === "input") {
      expect(next.visibility).toEqual({ kind: "always" });
    }
  });
});

describe("sanitize", () => {
  test("trims ids, labels, material references and forbidden pairs", () => {
    const definition = newDefinition("  e2e-x  ");
    definition.fields = [
      newField("choice", " szin ", { hu: " Szín " }),
      newField("material", " anyag ", { hu: " Anyag " }),
    ];

    const choice = definition.fields[0];
    if (choice.kind === "choice") {
      choice.options = [{ id: " kek ", label: { hu: " Kék " }, price: 0 }];
    }

    const material = definition.fields[1];
    if (material.kind === "material") {
      material.options = [{ materialId: " e2e-pamut ", price: 0 }];
    }

    definition.forbiddenMaterialCombinations = [[" e2e-pamut ", " e2e-vaszon "]];

    const cleaned = sanitize(definition);

    expect(cleaned.fields[0].id).toBe("szin");
    expect(cleaned.fields[0].label).toEqual({ hu: "Szín" });

    if (cleaned.fields[0].kind === "choice") {
      expect(cleaned.fields[0].options[0]).toEqual({ id: "kek", label: { hu: "Kék" }, price: 0 });
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
    label: { hu: label },
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
          { id: "", label: { hu: "Kék" }, price: 0 },
          { id: "", label: { hu: "Piros" }, price: 0 },
        ]),
        newField("toggle", "", { hu: "Ajándék csomagolás" }),
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
        newField("toggle", "meret", { hu: "Első" }),
        newField("toggle", "", { hu: "Méret" }),
        newField("toggle", "", { hu: "Méret" }),
        choiceField("szin", "Szín", [
          { id: "kek", label: { hu: "Kék" }, price: 0 },
          { id: "", label: { hu: "Kék" }, price: 0 },
          { id: "", label: { hu: "" }, price: 0 },
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
        fields: [choiceField("", "Szín", [{ id: "", label: { hu: "Kék" }, price: 0 }])],
      })
    );

    expect(ProductDefinitionSchema.safeParse(definition).success).toBe(true);
  });
});

describe("text helpers", () => {
  test("a non-default language edits its own entry and shows hu as placeholder", () => {
    const text = withText({ hu: "Méret" }, "en", "Size");

    expect(text).toEqual({ hu: "Méret", en: "Size" });
    expect(textValue(text, "en")).toBe("Size");
    expect(textPlaceholder({ hu: "Méret" }, "en")).toBe("Méret");
    expect(textPlaceholder(text, "en")).toBeUndefined();
    expect(textPlaceholder({ hu: "Méret" }, "hu")).toBeUndefined();
  });

  test("emptying a non-default language removes it, hu stays", () => {
    expect(withText({ hu: "Méret", en: "Size" }, "en", "")).toEqual({ hu: "Méret" });
    expect(withText({ hu: "Méret" }, "hu", "")).toEqual({ hu: "" });
  });
});

describe("planUnifiedSave", () => {
  test("saves only the page form when only it is dirty", () => {
    const state = { pageDirty: true, pageValid: true, configuratorDirty: false };

    expect(planUnifiedSave(state)).toEqual({ savePage: true, saveConfigurator: false });
  });

  test("saves both when both are dirty", () => {
    const state = { pageDirty: true, pageValid: true, configuratorDirty: true };

    expect(planUnifiedSave(state)).toEqual({ savePage: true, saveConfigurator: true });
  });

  test("an invalid dirty page does not block the configurator", () => {
    const state = { pageDirty: true, pageValid: false, configuratorDirty: true };

    expect(planUnifiedSave(state)).toEqual({ savePage: false, saveConfigurator: true });
  });

  test("is disabled when nothing is saveable", () => {
    expect(canUnifiedSave({ pageDirty: false, pageValid: true, configuratorDirty: false })).toBe(
      false
    );
    expect(canUnifiedSave({ pageDirty: true, pageValid: false, configuratorDirty: false })).toBe(
      false
    );
  });
});
