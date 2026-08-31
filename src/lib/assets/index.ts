/**
 * Resolve a CMS/config image path to a local `src/assets` module so it can be
 * handed to Astro's `<Image>` for optimization.
 *
 * Tina stores image fields relative to the media root (e.g.
 * `images/site-navigation/logo.png`), while migrated content uses the public
 * URL form (`/assets/Noémi-22.jpg`). Both normalize to the same glob key.
 *
 * In cloud builds (`tinacms build` without `--local`) Tina Cloud rewrites
 * `image` fields to an absolute CDN URL. Two forms occur:
 *   staging   `https://assets.tina.io/<id>/__staging/<branch>/__file/<path>`
 *   published `https://assets.tina.io/<id>/<path>`
 * We reduce either back to the media-root-relative path so it still resolves.
 */
import type { GetImageResult, ImageMetadata, UnresolvedImageTransform } from "astro";
import { tinaCloudMediaPath } from "./tinaImageUrl";
import { getImage } from "astro:assets";

const images = import.meta.glob<ImageMetadata>(
  "../assets/**/*.{jpg,jpeg,png,gif,svg,webp,avif,JPG,JPEG,PNG}",
  { eager: true, import: "default" }
);

export async function resolveImage(
  options: UnresolvedImageTransform
): Promise<GetImageResult | undefined> {
  let clean: string;
  if (typeof options.src === "string") {
    clean = options.src;
  } else if (typeof options.src === "object" && "src" in options.src) {
    clean = options.src.src;
  } else {
    const src = await options.src;
    clean = src.default.src;
  }

  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* malformed encoding — fall back to the literal form */
  }

  // Tina Cloud rewrites image fields to an absolute asset URL; reduce it back
  // to the path relative to the media root (`src/assets`).
  const tinaPath = tinaCloudMediaPath(clean);
  if (tinaPath) {
    clean = tinaPath;
  }

  // Strip an optional leading slash and the `src/assets/` media-root prefix.
  clean = clean.replace(/^\/?(src\/assets\/)?/, "");

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!images[`../assets/${clean}`]) {
    console.warn(`resolveImage: could not resolve "${clean}"`);
    return undefined;
  }

  return getImage({ ...options, src: images[`../assets/${clean}`] });
}
