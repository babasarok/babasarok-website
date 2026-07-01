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
import type { ImageMetadata } from "astro";

const images = import.meta.glob<ImageMetadata>(
  "../assets/**/*.{jpg,jpeg,png,gif,svg,webp,avif,JPG,JPEG,PNG}",
  { eager: true, import: "default" }
);

export function resolveImage(path: string | null | undefined): ImageMetadata | undefined {
  if (!path) {
    return undefined;
  }

  let clean = path;

  try {
    clean = decodeURIComponent(clean);
  } catch {
    /* malformed encoding — fall back to the literal form */
  }

  // Tina Cloud rewrites image fields to an absolute asset URL; reduce it back
  // to the path relative to the media root (`src/assets`). Staging builds put
  // the path after a `__file/` marker; published builds place it directly after
  // the `<id>` segment.
  const tinaFile = clean.match(/\/__file\/(.+)$/);
  if (tinaFile) {
    clean = tinaFile[1];
  } else {
    const tinaAsset = clean.match(/^https?:\/\/assets\.tina\.io\/[^/]+\/(.+)$/i);
    if (tinaAsset) {
      clean = tinaAsset[1];
    }
  }

  // Strip an optional leading slash and the `src/assets/` media-root prefix.
  clean = clean.replace(/^\/?(src\/assets\/)?/, "");

  return images[`../assets/${clean}`];
}
