import { describe, expect, it } from "vitest";
import { ASSET_PRESETS } from "./asset-presets";
import { PresetOrOriginalStrategy } from "./preset-or-original-strategy";

const strategy = new PresetOrOriginalStrategy({
  defaultPreset: "card-lg",
  permittedQuality: [75],
  permittedFormats: ["webp"],
});
const base = {
  width: 9999,
  height: 9999,
  mode: "crop",
  quality: 75,
  format: "webp",
  fpx: undefined,
  fpy: undefined,
  backgroundColor: undefined,
} as const;
const run = (preset: string | undefined) =>
  strategy.getImageTransformParameters({
    req: {} as never,
    availablePresets: [...ASSET_PRESETS],
    input: { ...base, preset },
  });

describe("PresetOrOriginalStrategy", () => {
  it("serves the original when no preset is given", async () => {
    expect(await run(undefined)).toMatchObject({
      width: undefined,
      height: undefined,
      format: undefined,
    });
  });

  it("uses the preset dimensions, ignoring requested ones", async () => {
    expect(await run("card-sm")).toMatchObject({
      width: 300,
      height: 300,
      mode: "crop",
      format: "webp",
      quality: 75,
    });
  });

  it("rejects unknown presets", async () => {
    await expect(Promise.resolve().then(() => run("huge"))).rejects.toThrow();
  });
});
