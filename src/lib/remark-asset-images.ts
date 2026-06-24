import { visit } from "unist-util-visit";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Root } from "mdast";
import type { VFile } from "vfile";

/**
 * Rewrites root-absolute markdown image URLs (e.g. `/assets/IMG_8843.JPG`,
 * `/IMG_8843.JPG`, written by TinaCMS) into paths relative to the markdown
 * file, pointing at `src/assets`, so Astro's asset pipeline imports +
 * optimizes them instead of treating them as missing `public/` files.
 *
 * Both the canonical Tina form (`/assets/...`, with `mediaRoot: "assets"` +
 * `publicFolder: "src"`) and the legacy root-absolute form (`/...`) are
 * supported; an optional leading `assets/` segment is stripped before the
 * lookup under `src/assets`.
 *
 * URLs are percent-decoded because some refs are encoded (e.g.
 * `/No%C3%A9mi-18.jpg` → `Noémi-18.jpg`) while the files on disk are not.
 *
 * A URL is only rewritten when the target file actually exists; otherwise it's
 * left untouched. Rewriting to a missing asset throws a hard `ImageNotFound`
 * error that fails the whole page, whereas leaving a bad public path just
 * yields a (broken) 404 image — far less destructive for stray content typos.
 */
export function remarkAssetImages() {
  return (tree: Root, file: VFile) => {
    const assetsDir = path.join(file.cwd, "src", "assets");
    const fileDir = file.path ? path.dirname(file.path) : file.cwd;

    visit(tree, "image", (node) => {
      if (!node.url.startsWith("/") || node.url.startsWith("//")) return;

      const rel = decodeURIComponent(node.url.slice(1)).replace(
        /^assets\//,
        "",
      );
      const absolute = path.join(assetsDir, rel);
      if (!existsSync(absolute)) return;

      let relPath = path.relative(fileDir, absolute);
      if (!relPath.startsWith(".")) relPath = "./" + relPath;
      node.url = relPath;
    });
  };
}
