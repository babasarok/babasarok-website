import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import { describe, expect, it } from "vitest";
import { materialPicks, type DefinitionField } from "./material-picks";

type Field = DefinitionField;

const field = (
  colorCount: { kind: "fixed"; count: number } | { kind: "from-field"; fieldId: string }
): Field[] =>
  ProductDefinitionSchema.parse({
    id: "termek",
    basePrice: 9000,
    pricing: { kind: "unit" },
    forbiddenMaterialCombinations: [],
    fields: [
      {
        kind: "material",
        id: "anyag",
        label: { hu: "Anyag" },
        colorCount,
        options: [
          { materialId: "wellsoft", price: 3000 },
          { materialId: "minky", price: 0 },
        ],
      },
    ],
  }).fields;

const fixed = field({ kind: "fixed", count: 1 });
const twoColors = field({ kind: "fixed", count: 2 });
const fromFonas = field({ kind: "from-field", fieldId: "fonas" });

describe("materialPicks", () => {
  it("takes the material from the axis code and the colors from the selection", () => {
    expect(
      materialPicks(fixed, new Map([["anyag", "wellsoft"]]), {
        anyag: { kind: "material", materialId: "minky", colors: ["piros"] },
      })
    ).toEqual([{ materialId: "wellsoft", colors: ["piros"] }]);
  });

  it("earns nothing when required colors are missing", () => {
    expect(materialPicks(fixed, new Map([["anyag", "wellsoft"]]), {})).toBeUndefined();
    expect(
      materialPicks(twoColors, new Map([["anyag", "wellsoft"]]), {
        anyag: { kind: "material", materialId: "wellsoft", colors: ["piros"] },
      })
    ).toBeUndefined();
  });

  it("resolves a from-field color count from the referenced selection", () => {
    expect(
      materialPicks(fromFonas, new Map([["anyag", "minky"]]), {
        fonas: { kind: "option", value: "3" },
        anyag: { kind: "material", materialId: "wellsoft", colors: ["a", "b", "c"] },
      })
    ).toEqual([{ materialId: "minky", colors: ["a", "b", "c"] }]);
    expect(
      materialPicks(fromFonas, new Map([["anyag", "minky"]]), {
        fonas: { kind: "option", value: "3" },
        anyag: { kind: "material", materialId: "wellsoft", colors: ["a"] },
      })
    ).toBeUndefined();
    expect(materialPicks(fromFonas, new Map([["anyag", "minky"]]), {})).toBeUndefined();
  });

  it("earns nothing without a material code", () => {
    expect(materialPicks(fixed, new Map(), {})).toBeUndefined();
  });

  it("matches trivially without material fields", () => {
    const plain = ProductDefinitionSchema.parse({
      id: "termek",
      basePrice: 9000,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [],
    }).fields;

    expect(materialPicks(plain, new Map(), null)).toEqual([]);
  });
});
