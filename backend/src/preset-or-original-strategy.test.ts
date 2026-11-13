import { describe, expect, it } from "vitest";
import { ASSET_PRESETS } from "./shared/asset-presets";
import { PresetOrOriginalStrategy } from "./preset-or-original-strategy";

const strategy = new PresetOrOriginalStrategy({
  defaultPreset: "card-lg",
  permittedQuality: [75],
  permittedFormats: ["webp"],
  allowFocalPoint: true,
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
const run = (preset?: string): ReturnType<typeof strategy.getImageTransformParameters> =>
  strategy.getImageTransformParameters({
    req: {} as never,
    availablePresets: [...ASSET_PRESETS],
    input: { ...base, preset },
  });

describe("PresetOrOriginalStrategy", () => {
  it("serves the original when no preset is given", async () => {
    expect(await run()).toMatchObject({
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

  it("passes the requested focal point through to a preset transform", async () => {
    expect(
      await strategy.getImageTransformParameters({
        req: {} as never,
        availablePresets: [...ASSET_PRESETS],
        input: { ...base, preset: "card-sm", fpx: 0.3, fpy: 0.7 },
      })
    ).toMatchObject({ width: 300, height: 300, mode: "crop", fpx: 0.3, fpy: 0.7 });
  });
});
