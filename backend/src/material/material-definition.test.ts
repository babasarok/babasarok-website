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
        subtitle: null,
        description: null,
        thumbnail: null,
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
        subtitle: null,
        description: null,
        thumbnail: null,
        colors: [{ id: "mintas", label: "Mintás", appearance: { kind: "image", assetId: "2" } }],
      },
    });
  });

  it("passes optional content fields through, trimming whitespace and normalizing absent values", () => {
    const filled = validateMaterialInput(
      input({
        subtitle: "  Puha, bársonyos anyag  ",
        description: "  Első sor\nMásodik sor  ",
        thumbnailAssetId: "1",
      }),
      KNOWN_ASSETS
    );
    const absent = validateMaterialInput(
      input({ subtitle: null, description: null, thumbnailAssetId: null }),
      KNOWN_ASSETS
    );

    expect(filled.success).toBe(true);

    if (filled.success) {
      expect(filled.definition.subtitle).toBe("Puha, bársonyos anyag");
      expect(filled.definition.description).toBe("Első sor\nMásodik sor");
      expect(filled.definition.thumbnail).toEqual({ assetId: "1" });
    }

    expect(absent.success).toBe(true);

    if (absent.success) {
      expect(absent.definition.subtitle).toBeNull();
      expect(absent.definition.description).toBeNull();
      expect(absent.definition.thumbnail).toBeNull();
    }
  });

  it("rejects whitespace-only content fields and unknown or malformed thumbnail assets", () => {
    const blankSubtitle = validateMaterialInput(input({ subtitle: "   " }), KNOWN_ASSETS);
    const blankDescription = validateMaterialInput(input({ description: "" }), KNOWN_ASSETS);
    const unknownThumbnail = validateMaterialInput(
      input({ thumbnailAssetId: "999" }),
      KNOWN_ASSETS
    );
    const malformedThumbnail = validateMaterialInput(
      input({ thumbnailAssetId: "not-a-number" }),
      KNOWN_ASSETS
    );

    expect(blankSubtitle.success).toBe(false);
    expect(blankDescription.success).toBe(false);
    expect(unknownThumbnail).toEqual({
      success: false,
      errors: ["thumbnail: a megadott kép nem létezik."],
    });
    expect(malformedThumbnail).toEqual({
      success: false,
      errors: ["thumbnail: érvénytelen kép azonosító."],
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
