import { visit } from "unist-util-visit";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Root } from "mdast";
import type { VFile } from "vfile";

// Tina's media root (see tina/config.ts `media.tina.mediaRoot`). Cloud asset
// URLs encode the path *relative to this folder* after the `/__file/` marker.
const MEDIA_ROOT = "src/assets";

// Cloud builds rewrite body-image URLs to an absolute Tina Cloud CDN URL of the
// form `https://assets.tina.io/<id>/__staging/<branch>/__file/<media-root-path>`.
const TINA_CLOUD_FILE = /^https?:\/\/assets\.tina\.io\/.*\/__file\/(.+)$/;

export function remarkAssetImages() {
  return (tree: Root, file: VFile) => {
    const rootDir = path.join(file.cwd);
    const fileDir = file.path ? path.dirname(file.path) : file.cwd;

    // Point the node at a local `src/assets` file (relative to the content
    // file) so Astro optimizes it instead of shipping the raw reference.
    const rewriteToLocal = (node: { url: string }, absolute: string): void => {
      if (!existsSync(absolute)) {
        return;
      }
      let relPath = path.relative(fileDir, absolute);
      if (!relPath.startsWith(".")) {
        relPath = "./" + relPath;
      }
      node.url = relPath;
    };

    // TODO: This needs to happen before astro image processing otherwise it will just get
    // it from /src/assets instead of going though image processing.
    visit(tree, "image", (node) => {
      // Cloud build: reduce the Tina Cloud URL back to its media-root-relative
      // path and resolve it against `src/assets`, otherwise the page would
      // hot-link to Tina Cloud (see scripts/test/no-tina-cloud-urls.ts).
      const cloud = node.url.match(TINA_CLOUD_FILE);
      if (cloud) {
        let mediaRelative = cloud[1];
        try {
          mediaRelative = decodeURIComponent(mediaRelative);
        } catch {
          /* malformed encoding — fall back to the literal form */
        }
        rewriteToLocal(node, path.join(rootDir, MEDIA_ROOT, mediaRelative));
        return;
      }

      if (!node.url.startsWith("/") || node.url.startsWith("//")) {
        return;
      }

      // Replace all leading slashes with nothing for node.url so we can resolve the path to the file in src/assets
      rewriteToLocal(node, path.join(rootDir, node.url.slice(1)));
    });
  };
}
