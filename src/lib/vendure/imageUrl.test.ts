import { describe, expect, it } from "vitest";
import { imageSrcSet, imageUrl } from "./imageUrl";

const BASE = "https://api.example/assets/";

describe("imageUrl", () => {
  it("adds preset, webp and quality to an absolute source", () => {
    expect(imageUrl("https://api.example/assets/source/ab/a.jpg", "card-sm", BASE)).toBe(
      "https://api.example/assets/source/ab/a.jpg?preset=card-sm&format=webp&q=75&fpx=0.5&fpy=0.5"
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

  it("center-crops crop presets without a focal point", () => {
    expect(imageUrl("source/a.jpg", "card-lg", BASE, null)).toBe(
      "https://api.example/assets/source/a.jpg?preset=card-lg&format=webp&q=75&fpx=0.5&fpy=0.5"
    );
  });

  it("crops crop presets at the asset's focal point when set", () => {
    expect(imageUrl("source/a.jpg", "card-sm", BASE, { x: 0.3, y: 0.7 })).toBe(
      "https://api.example/assets/source/a.jpg?preset=card-sm&format=webp&q=75&fpx=0.3&fpy=0.7"
    );
  });

  it("ignores the focal point on resize presets", () => {
    expect(imageUrl("source/a.jpg", "hero-lg", BASE, { x: 0.3, y: 0.7 })).toBe(
      "https://api.example/assets/source/a.jpg?preset=hero-lg&format=webp&q=75"
    );
  });
});

describe("imageSrcSet", () => {
  it("labels each url with its preset width", () => {
    expect(imageSrcSet("source/a.jpg", ["card-sm", "card-lg"], BASE)).toBe(
      "https://api.example/assets/source/a.jpg?preset=card-sm&format=webp&q=75&fpx=0.5&fpy=0.5 300w, https://api.example/assets/source/a.jpg?preset=card-lg&format=webp&q=75&fpx=0.5&fpy=0.5 600w"
    );
  });
});
