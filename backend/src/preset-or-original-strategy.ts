import { PresetOnlyStrategy } from "@vendure/asset-server-plugin";
import type { GetImageTransformParametersArgs } from "@vendure/asset-server-plugin";

const ORIGINAL_PRESETS: ReadonlySet<string> = new Set(["full"]);

export class PresetOrOriginalStrategy extends PresetOnlyStrategy {
  override getImageTransformParameters(
    args: GetImageTransformParametersArgs
  ): ReturnType<PresetOnlyStrategy["getImageTransformParameters"]> {
    if (args.input.preset === undefined || ORIGINAL_PRESETS.has(args.input.preset)) {
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
