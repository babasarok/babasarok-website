import { describe, expect, it } from "vitest";
import { variantRelevantChange } from "./variant-relevant";

const material = {
  translations: [{ languageCode: "hu", label: "Teddy" }],
  colors: [
    { colorId: "barna", translations: [{ languageCode: "hu", label: "Barna" }] },
    { colorId: "kek", translations: [{ languageCode: "hu", label: "Kék" }] },
  ],
};

describe("variantRelevantChange", () => {
  it("ignores an update that leaves label and colors alone, whatever the row order", () => {
    expect(
      variantRelevantChange(material, { ...material, colors: material.colors.toReversed() })
    ).toBe(false);
  });

  it("sees a renamed material", () => {
    expect(
      variantRelevantChange(material, {
        ...material,
        translations: [{ languageCode: "hu", label: "Teddy plüss" }],
      })
    ).toBe(true);
  });

  it("sees a renamed, added or removed color", () => {
    const [barna, kek] = material.colors;

    expect(
      variantRelevantChange(material, {
        ...material,
        colors: [barna, { ...kek, translations: [{ languageCode: "hu", label: "Égkék" }] }],
      })
    ).toBe(true);

    expect(variantRelevantChange(material, { ...material, colors: [barna] })).toBe(true);

    expect(
      variantRelevantChange(material, {
        ...material,
        colors: [...material.colors, { colorId: "zold", translations: [] }],
      })
    ).toBe(true);
  });
});
