import { describe, expect, it } from "vitest";
import { ASSET_PRESETS } from "../../../backend/src/asset-presets";
import { IMAGE_PRESET_WIDTHS, imageSrcSet, imageUrl } from "./imageUrl";

const BASE = "https://api.example/assets/";

describe("imageUrl", () => {
  it("adds preset, webp and quality to an absolute source", () => {
    expect(imageUrl("https://api.example/assets/source/ab/a.jpg", "card-sm", BASE)).toBe(
      "https://api.example/assets/source/ab/a.jpg?preset=card-sm&format=webp&q=75"
    );
  });

  it("resolves a host-relative asset path against the asset base", () => {
    expect(imageUrl("source/ab/a.jpg", "hero-md", BASE)).toBe(
      "https://api.example/assets/source/ab/a.jpg?preset=hero-md&format=webp&q=75"
    );
  });

  it("replaces an existing preset instead of stacking", () => {
    expect(imageUrl("source/a.jpg?preset=tiny", "card-lg", BASE)).toContain("preset=card-lg");
  });
});

describe("imageSrcSet", () => {
  it("labels each url with its preset width", () => {
    expect(imageSrcSet("source/a.jpg", ["card-sm", "card-lg"], BASE)).toBe(
      "https://api.example/assets/source/a.jpg?preset=card-sm&format=webp&q=75 300w, https://api.example/assets/source/a.jpg?preset=card-lg&format=webp&q=75 600w"
    );
  });
});

describe("preset table", () => {
  it("matches the backend's presets", () => {
    expect(IMAGE_PRESET_WIDTHS).toEqual(
      Object.fromEntries(ASSET_PRESETS.map((preset) => [preset.name, preset.width]))
    );
  });
});
