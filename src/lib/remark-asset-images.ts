import { visit } from "unist-util-visit";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Root } from "mdast";
import type { VFile } from "vfile";
import { tinaCloudMediaPath } from "./tinaImageUrl";

// Tina's media root (see tina/config.ts `media.tina.mediaRoot`). Cloud asset
// URLs encode the path *relative to this folder*.
const MEDIA_ROOT = "src/assets";

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
      let mediaRelative = tinaCloudMediaPath(node.url);
      if (mediaRelative) {
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
