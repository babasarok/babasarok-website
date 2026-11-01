import { describe, expect, it } from "vitest";
import { validateMaterialInput, type MaterialInputData } from "./material-definition";

const KNOWN_ASSETS = new Set([1, 2]);

function input(overrides: Partial<MaterialInputData> = {}): MaterialInputData {
  return {
    id: "velur",
    label: "Velúr",
    colors: [{ id: "piros", label: "Piros", hex: "#FF0000", assetId: null }],
    ...overrides,
  };
}

describe("validateMaterialInput", () => {
  it("accepts a hex color and maps it to the canonical appearance", () => {
    const result = validateMaterialInput(input(), KNOWN_ASSETS);

    expect(result).toEqual({
      success: true,
      definition: {
        id: "velur",
        label: "Velúr",
        colors: [{ id: "piros", label: "Piros", appearance: { kind: "hex", value: "#FF0000" } }],
      },
    });
  });

  it("accepts an existing asset reference and maps it to the image appearance", () => {
    const result = validateMaterialInput(
      input({ colors: [{ id: "mintas", label: "Mintás", hex: null, assetId: "2" }] }),
      KNOWN_ASSETS
    );

    expect(result).toEqual({
      success: true,
      definition: {
        id: "velur",
        label: "Velúr",
        colors: [{ id: "mintas", label: "Mintás", appearance: { kind: "image", assetId: "2" } }],
      },
    });
  });

  it("rejects a color with both hex and asset", () => {
    const result = validateMaterialInput(
      input({ colors: [{ id: "x", label: "X", hex: "#FFFFFF", assetId: "1" }] }),
      KNOWN_ASSETS
    );

    expect(result).toEqual({
      success: false,
      errors: ["x: adj meg hex kódot VAGY képet, ne mindkettőt."],
    });
  });

  it("rejects a color with neither hex nor asset", () => {
    const result = validateMaterialInput(
      input({ colors: [{ id: "x", label: "X", hex: null, assetId: null }] }),
      KNOWN_ASSETS
    );

    expect(result).toEqual({
      success: false,
      errors: ["x: kötelező hex kódot vagy képet megadni."],
    });
  });

  it("rejects unknown and malformed asset references", () => {
    const result = validateMaterialInput(
      input({
        colors: [
          { id: "a", label: "A", hex: null, assetId: "999" },
          { id: "b", label: "B", hex: null, assetId: "not-a-number" },
        ],
      }),
      KNOWN_ASSETS
    );

    expect(result).toEqual({
      success: false,
      errors: ["a: a megadott kép nem létezik.", "b: érvénytelen kép azonosító."],
    });
  });

  it("rejects duplicate color ids", () => {
    const result = validateMaterialInput(
      input({
        colors: [
          { id: "dup", label: "A", hex: "#111111", assetId: null },
          { id: "dup", label: "B", hex: "#222222", assetId: null },
        ],
      }),
      KNOWN_ASSETS
    );

    expect(result).toEqual({
      success: false,
      errors: ["dup: Ez az azonosító már létezik a színek/minták között."],
    });
  });

  it("surfaces canonical schema violations (bad hex format, whitespace, no colors)", () => {
    const badHex = validateMaterialInput(
      input({ colors: [{ id: "x", label: "X", hex: "red", assetId: null }] }),
      KNOWN_ASSETS
    );
    const emptyLabel = validateMaterialInput(input({ label: "  " }), KNOWN_ASSETS);
    const noColors = validateMaterialInput(input({ colors: [] }), KNOWN_ASSETS);

    expect(badHex.success).toBe(false);
    expect(emptyLabel.success).toBe(false);
    expect(noColors.success).toBe(false);

    if (!noColors.success) {
      expect(noColors.errors.join("\n")).toMatch(/colors/);
    }
  });
});
