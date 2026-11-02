import { describe, expect, it } from "vitest";
import { validateMaterialInput, type MaterialInputData } from "./material-definition";

const KNOWN_ASSETS = new Set([1, 2]);

function hu(label: string): Array<{ languageCode: string; label: string }> {
  return [{ languageCode: "hu", label }];
}

function input(overrides: Partial<MaterialInputData> = {}): MaterialInputData {
  return {
    slug: "velur",
    translations: [{ languageCode: "hu", label: "Velúr" }],
    colors: [{ id: "piros", translations: hu("Piros"), hex: "#FF0000", assetId: null }],
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
        label: { hu: "Velúr" },
        subtitle: null,
        description: null,
        thumbnail: null,
        colors: [
          { id: "piros", label: { hu: "Piros" }, appearance: { kind: "hex", value: "#FF0000" } },
        ],
      },
    });
  });

  it("accepts an existing asset reference and maps it to the image appearance", () => {
    const result = validateMaterialInput(
      input({ colors: [{ id: "mintas", translations: hu("Mintás"), hex: null, assetId: "2" }] }),
      KNOWN_ASSETS
    );

    expect(result).toEqual({
      success: true,
      definition: {
        id: "velur",
        label: { hu: "Velúr" },
        subtitle: null,
        description: null,
        thumbnail: null,
        colors: [
          { id: "mintas", label: { hu: "Mintás" }, appearance: { kind: "image", assetId: "2" } },
        ],
      },
    });
  });

  it("passes optional content fields through, trimming whitespace and normalizing absent values", () => {
    const filled = validateMaterialInput(
      input({
        translations: [
          {
            languageCode: "hu",
            label: "Velúr",
            subtitle: "  Puha, bársonyos anyag  ",
            description: "  Első sor\nMásodik sor  ",
          },
          { languageCode: "en", label: "Velour", subtitle: "Soft" },
        ],
        thumbnailAssetId: "1",
      }),
      KNOWN_ASSETS
    );
    const absent = validateMaterialInput(input({ thumbnailAssetId: null }), KNOWN_ASSETS);

    expect(filled.success).toBe(true);

    if (filled.success) {
      expect(filled.definition.subtitle).toEqual({ hu: "Puha, bársonyos anyag", en: "Soft" });
      expect(filled.definition.description).toEqual({ hu: "Első sor\nMásodik sor" });
      expect(filled.definition.thumbnail).toEqual({ assetId: "1" });
    }

    expect(absent.success).toBe(true);

    if (absent.success) {
      expect(absent.definition.subtitle).toBeNull();
      expect(absent.definition.description).toBeNull();
      expect(absent.definition.thumbnail).toBeNull();
    }
  });

  it("requires a hungarian label and treats blank translations as absent", () => {
    const withoutHu = validateMaterialInput(
      input({ translations: [{ languageCode: "en", label: "Velour" }] }),
      KNOWN_ASSETS
    );
    const blankSubtitle = validateMaterialInput(
      input({ translations: [{ languageCode: "hu", label: "Velúr", subtitle: "   " }] }),
      KNOWN_ASSETS
    );

    expect(withoutHu.success).toBe(false);
    expect(blankSubtitle.success && blankSubtitle.definition.subtitle).toBeNull();
  });

  it("rejects unknown or malformed thumbnail assets", () => {
    const unknownThumbnail = validateMaterialInput(
      input({ thumbnailAssetId: "999" }),
      KNOWN_ASSETS
    );
    const malformedThumbnail = validateMaterialInput(
      input({ thumbnailAssetId: "not-a-number" }),
      KNOWN_ASSETS
    );

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
      input({ colors: [{ id: "x", translations: hu("X"), hex: "#FFFFFF", assetId: "1" }] }),
      KNOWN_ASSETS
    );

    expect(result).toEqual({
      success: false,
      errors: ["x: adj meg hex kódot VAGY képet, ne mindkettőt."],
    });
  });

  it("rejects a color with neither hex nor asset", () => {
    const result = validateMaterialInput(
      input({ colors: [{ id: "x", translations: hu("X"), hex: null, assetId: null }] }),
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
          { id: "a", translations: hu("A"), hex: null, assetId: "999" },
          { id: "b", translations: hu("B"), hex: null, assetId: "not-a-number" },
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
          { id: "dup", translations: hu("A"), hex: "#111111", assetId: null },
          { id: "dup", translations: hu("B"), hex: "#222222", assetId: null },
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
      input({ colors: [{ id: "x", translations: hu("X"), hex: "red", assetId: null }] }),
      KNOWN_ASSETS
    );
    const emptyLabel = validateMaterialInput(input({ translations: hu("  ") }), KNOWN_ASSETS);
    const noColors = validateMaterialInput(input({ colors: [] }), KNOWN_ASSETS);

    expect(badHex.success).toBe(false);
    expect(emptyLabel.success).toBe(false);
    expect(noColors.success).toBe(false);

    if (!noColors.success) {
      expect(noColors.errors.join("\n")).toMatch(/colors/);
    }
  });
});
