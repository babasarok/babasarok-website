import { ASSET_PRESETS } from "@babasarok/asset-presets";

export type ImagePreset = (typeof ASSET_PRESETS)[number]["name"];

export interface VendureFocalPoint {
  x: number;
  y: number;
}

export interface VendureAsset {
  source: string;
  focalPoint: VendureFocalPoint | null;
}

const IMAGE_PRESET_WIDTHS = Object.fromEntries(
  ASSET_PRESETS.map((preset) => [preset.name, preset.width] as const)
) as Record<ImagePreset, number>;

const CROP_PRESETS: ReadonlySet<ImagePreset> = new Set(
  ASSET_PRESETS.filter((preset) => preset.mode === "crop").map((preset) => preset.name)
);

const IMAGE_QUALITY = "75";

/** Vendure crops around the focal point; without one the crop is centred. */
const CENTER: VendureFocalPoint = { x: 0.5, y: 0.5 };

export function imageUrl(
  source: string,
  preset: ImagePreset,
  assetBase: string,
  focalPoint?: VendureFocalPoint | null
): string {
  const url = new URL(source, assetBase);

  url.searchParams.set("preset", preset);
  url.searchParams.set("format", "webp");
  url.searchParams.set("q", IMAGE_QUALITY);

  if (CROP_PRESETS.has(preset)) {
    const { x, y } = focalPoint ?? CENTER;

    url.searchParams.set("fpx", String(x));
    url.searchParams.set("fpy", String(y));
  }

  return url.href;
}

export function imageSrcSet(
  source: string,
  presets: readonly ImagePreset[],
  assetBase: string,
  focalPoint?: VendureFocalPoint | null
): string {
  return presets
    .map(
      (preset) =>
        `${imageUrl(source, preset, assetBase, focalPoint)} ${IMAGE_PRESET_WIDTHS[preset]}w`
    )
    .join(", ");
}
