import { describe, expect, it } from "vitest";
import { ProductDefinitionSchema } from "../product-definition/index";
import { axisCodes } from "./axis-codes";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "40", label: { hu: "40x40" }, price: 0 },
        { id: "50", label: { hu: "50x50" }, price: 2000 },
      ],
      customValue: {},
    },
    {
      kind: "toggle",
      id: "fodor",
      label: { hu: "Fodorral" },
      visibility: { kind: "always" },
      price: 1800,
    },
    {
      kind: "material",
      id: "anyag",
      label: { hu: "Anyag" },
      colorCount: { kind: "fixed", count: 1 },
      options: [
        { materialId: "wellsoft", price: 3000 },
        { materialId: "minky", price: 0 },
      ],
    },
    {
      kind: "choice",
      id: "szin",
      label: { hu: "Szín" },
      presentation: "color",
      visibility: { kind: "always" },
      options: [{ id: "piros", label: { hu: "Piros" }, price: 500 }],
    },
  ],
});

describe("axisCodes", () => {
  it("reads every variant-axis field's code from the selections", () => {
    expect(
      axisCodes(
        definition,
        {
          meret: { kind: "option", value: "50" },
          fodor: { kind: "option", value: "igen" },
          anyag: { kind: "material", materialId: "minky", colors: ["piros"] },
          szin: { kind: "option", value: "piros" },
        },
        "hu"
      )
    ).toEqual({
      ok: true,
      codes: new Map([
        ["meret", "50"],
        ["fodor", "igen"],
        ["anyag", "minky"],
      ]),
    });
  });

  it("defaults an absent toggle to nem and other absent fields to the first option", () => {
    expect(axisCodes(definition, {}, "hu")).toEqual({
      ok: true,
      codes: new Map([
        ["meret", "40"],
        ["fodor", "nem"],
        ["anyag", "wellsoft"],
      ]),
    });
  });

  it("pins a custom value to the listed option it names, else the first", () => {
    const named = axisCodes(definition, { meret: { kind: "custom", value: "50" } }, "hu");
    const unnamed = axisCodes(definition, { meret: { kind: "custom", value: "45" } }, "hu");

    expect(named.ok && named.codes.get("meret")).toBe("50");
    expect(unnamed.ok && unnamed.codes.get("meret")).toBe("40");
  });

  it("refuses a value the field does not offer", () => {
    expect(axisCodes(definition, { meret: { kind: "option", value: "60" } }, "hu").ok).toBe(false);
    expect(
      axisCodes(definition, { anyag: { kind: "material", materialId: "teddy", colors: [] } }, "hu")
        .ok
    ).toBe(false);
    expect(axisCodes(definition, { fodor: { kind: "option", value: "talan" } }, "hu").ok).toBe(
      false
    );
  });
});
