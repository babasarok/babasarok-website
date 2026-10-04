import { describe, expect, it } from "vitest";
import type { TinaMaterialSource } from "./adapters/tina/material";
import { compileMaterial } from "./adapters/tina/material";

function material(overrides: Partial<TinaMaterialSource> = {}): TinaMaterialSource {
  return {
    __typename: "Product_materials",
    material_id: "pamut",
    label: "Pamut",
    thumbnail: null,
    categories: null,
    shortDescription: null,
    content: null,
    colors: [
      {
        __typename: "Product_materialsColors",
        color_id: "feher",
        label: "Fehér",
        hex: "#FFFFFF",
        image: null,
      },
      {
        __typename: "Product_materialsColors",
        color_id: "mintas",
        label: "Mintás",
        hex: null,
        image: "/src/assets/mintas.webp",
      },
    ],
    ...overrides,
  };
}

describe("compileMaterial", () => {
  it("compiles generated Tina output into a strict Material definition", () => {
    expect(compileMaterial(material())).toEqual({
      success: true,
      value: {
        id: "pamut",
        label: "Pamut",
        colors: [
          {
            id: "feher",
            label: "Fehér",
            appearance: { kind: "hex", value: "#FFFFFF" },
          },
          {
            id: "mintas",
            label: "Mintás",
            appearance: { kind: "image", assetId: "/src/assets/mintas.webp" },
          },
        ],
      },
    });
  });

  it("reports every independent Material-color problem", () => {
    const result = compileMaterial(
      material({
        colors: [
          {
            __typename: "Product_materialsColors",
            color_id: "azonos",
            label: "Első",
            hex: "#FFFFFF",
            image: "/src/assets/elso.webp",
          },
          {
            __typename: "Product_materialsColors",
            color_id: " azonos ",
            label: "Második",
            hex: null,
            image: null,
          },
        ],
      })
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "material.color.appearance-conflict",
        "material.color.duplicate-id",
        "material.color.appearance-missing",
      ])
    );
  });

  it("rejects invalid canonical color values", () => {
    const result = compileMaterial(
      material({
        colors: [
          {
            __typename: "Product_materialsColors",
            color_id: "hibas",
            label: "Hibás",
            hex: "red",
            image: null,
          },
        ],
      })
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "material.definition-invalid",
          path: ["colors", 0, "appearance", "value"],
        }),
      ])
    );
  });
});
