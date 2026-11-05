import { describe, expect, it } from "vitest";
import { MaterialDefinitionSchema } from "./material";

describe("MaterialDefinitionSchema", () => {
  const color = {
    id: "feher",
    label: { hu: "Fehér" },
    appearance: { kind: "hex", value: "#FFFFFF" },
  };
  const validMaterial = {
    id: "pamut",
    label: { hu: "Pamut" },
    subtitle: { hu: "Pamut alapanyag" },
    description: { hu: "Puha pamut anyag" },
    thumbnail: { assetId: "/pamut.webp" },
    colors: [color],
  };

  it("accepts a valid material", () => {
    expect(MaterialDefinitionSchema.safeParse(validMaterial).success).toBe(true);
  });

  it("accepts a material without the optional presentation fields", () => {
    expect(
      MaterialDefinitionSchema.safeParse({ id: "pamut", label: { hu: "Pamut" }, colors: [color] })
        .success
    ).toBe(true);
  });

  it.each([
    ["an unknown key on the material", { ...validMaterial, extra: true }],
    ["an unknown key on a color", { ...validMaterial, colors: [{ ...color, extra: true }] }],
    [
      "a hex appearance carrying assetId",
      {
        ...validMaterial,
        colors: [
          { ...color, appearance: { kind: "hex", value: "#FFFFFF", assetId: "/mintas.webp" } },
        ],
      },
    ],
    [
      "an image appearance carrying value",
      {
        ...validMaterial,
        colors: [
          { ...color, appearance: { kind: "image", assetId: "/mintas.webp", value: "#FFFFFF" } },
        ],
      },
    ],
    ["zero colors", { ...validMaterial, colors: [] }],
    ["an untrimmed label", { ...validMaterial, label: { hu: " Pamut " } }],
    [
      "an invalid hex value",
      { ...validMaterial, colors: [{ ...color, appearance: { kind: "hex", value: "red" } }] },
    ],
  ])("rejects %s", (_description, source) => {
    expect(MaterialDefinitionSchema.safeParse(source).success).toBe(false);
  });
});
