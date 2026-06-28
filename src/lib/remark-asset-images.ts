import { visit } from "unist-util-visit";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Root } from "mdast";
import type { VFile } from "vfile";

export function remarkAssetImages() {
  return (tree: Root, file: VFile) => {
    const rootDir = path.join(file.cwd);
    const fileDir = file.path ? path.dirname(file.path) : file.cwd;

    // TODO: This needs to happen before astro image processing otherwise it will just get
    // it from /src/assets instead of going though image processing.
    visit(tree, "image", (node) => {
      if (!node.url.startsWith("/") || node.url.startsWith("//")) {
        return;
      }

      // Replace all leading slashes with nothing for node.url so we can resolve the path to the file in src/assets
      const absolute = path.join(
        rootDir,
        node.url.at(0) === "/" ? node.url.slice(1) : node.url,
      );

      if (!existsSync(absolute)) {
        return;
      }

      let relPath = path.relative(fileDir, absolute);
      if (!relPath.startsWith(".")) {
        relPath = "./" + relPath;
      }
      node.url = relPath;
    });
  };
}
