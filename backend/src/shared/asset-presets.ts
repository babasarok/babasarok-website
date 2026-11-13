export const ASSET_PRESETS = [
  { name: "card-sm", width: 300, height: 300, mode: "crop" },
  { name: "card-lg", width: 600, height: 600, mode: "crop" },
  { name: "hero-sm", width: 480, height: 480, mode: "resize" },
  { name: "hero-md", width: 768, height: 768, mode: "resize" },
  { name: "hero-lg", width: 1000, height: 1000, mode: "resize" },
] as const;

export const ASSET_QUALITY = 75;
