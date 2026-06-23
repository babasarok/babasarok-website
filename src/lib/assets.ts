/**
 * Resolve a CMS/config image path to a local `src/assets` module so it can be
 * handed to Astro's `<Image>` for optimization.
 *
 * Tina stores image fields relative to the media root (e.g.
 * `images/site-navigation/logo.png`), while migrated content uses the public
 * URL form (`/assets/Noémi-22.jpg`). Both normalize to the same glob key.
 */
import type { ImageMetadata } from "astro";

const images = import.meta.glob<ImageMetadata>(
  "../assets/**/*.{jpg,jpeg,png,gif,svg,webp,avif,JPG,JPEG,PNG}",
  { eager: true, import: "default" },
);

export function resolveImage(
  path: string | null | undefined,
): ImageMetadata | undefined {
  if (!path) return undefined;
  const clean = path.replace(/^\/?(assets\/)?/, "");
  return images[`../assets/${clean}`];
}
