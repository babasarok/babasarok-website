export const IMAGE_PRESET_WIDTHS = {
  "card-sm": 300,
  "card-lg": 600,
  "hero-sm": 480,
  "hero-md": 768,
  "hero-lg": 1000,
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESET_WIDTHS;

const IMAGE_QUALITY = "75";

/**
 * `source` is either an absolute asset URL from the shop API or a host-relative
 * asset path such as `source/ab/file.jpg`, resolved against `assetBase`
 * (e.g. `https://api.example/assets/`).
 */
export function imageUrl(source: string, preset: ImagePreset, assetBase: string): string {
  const url = new URL(source, assetBase);

  url.searchParams.set("preset", preset);
  url.searchParams.set("format", "webp");
  url.searchParams.set("q", IMAGE_QUALITY);

  return url.href;
}

export function imageSrcSet(
  source: string,
  presets: readonly ImagePreset[],
  assetBase: string
): string {
  return presets
    .map((preset) => `${imageUrl(source, preset, assetBase)} ${IMAGE_PRESET_WIDTHS[preset]}w`)
    .join(", ");
}
