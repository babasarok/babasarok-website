import { PresetOnlyStrategy } from "@vendure/asset-server-plugin";
import type { GetImageTransformParametersArgs } from "@vendure/asset-server-plugin";

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
