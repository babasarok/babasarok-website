/**
 * Reduce a Tina Cloud asset URL to its media-root-relative path.
 *
 * In cloud builds (`tinacms build` without `--local`) Tina Cloud rewrites image
 * fields to an absolute CDN URL in one of two forms:
 *   staging   `https://assets.tina.io/<id>/__staging/<branch>/__file/<path>`
 *   published `https://assets.tina.io/<id>/<path>`
 * Both encode `<path>` relative to the media root (`src/assets`). Returns that
 * path, or `undefined` when `url` is not a Tina Cloud asset URL.
 *
 * Kept free of side effects (no image glob) so it can be shared by the remark
 * pipeline (src/lib/remark-asset-images.ts) and `resolveImage`
 * (src/lib/assets.ts). Callers decode the result themselves.
 */
const TINA_CLOUD_FILE = /\/__file\/(.+)$/;
const TINA_CLOUD_ASSET = /^https?:\/\/assets\.tina\.io\/[^/]+\/(.+)$/i;

export function tinaCloudMediaPath(url: string): string | undefined {
  // Staging builds put the path after a `__file/` marker; published builds
  // place it directly after the `<id>` segment. Check `__file/` first, since a
  // staging URL also matches the broader published pattern.
  const file = url.match(TINA_CLOUD_FILE);
  if (file) {
    return file[1];
  }
  const asset = url.match(TINA_CLOUD_ASSET);
  return asset ? asset[1] : undefined;
}
