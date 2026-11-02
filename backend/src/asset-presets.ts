import { PresetOnlyStrategy } from "@vendure/asset-server-plugin";
import type { GetImageTransformParametersArgs } from "@vendure/asset-server-plugin";

export const ASSET_PRESETS = [
  { name: "card-sm", width: 300, height: 300, mode: "crop" },
  { name: "card-lg", width: 600, height: 600, mode: "crop" },
  { name: "hero-sm", width: 480, height: 480, mode: "resize" },
  { name: "hero-md", width: 768, height: 768, mode: "resize" },
  { name: "hero-lg", width: 1000, height: 1000, mode: "resize" },
] as const;

export const ASSET_QUALITY = 75;

export class PresetOrOriginalStrategy extends PresetOnlyStrategy {
  override getImageTransformParameters(args: GetImageTransformParametersArgs) {
    if (args.input.preset === undefined) {
      return {
        width: undefined,
        height: undefined,
        mode: undefined,
        quality: undefined,
        format: undefined,
        fpx: undefined,
        fpy: undefined,
        preset: undefined,
        backgroundColor: undefined,
      };
    }

    return super.getImageTransformParameters(args);
  }
}
