import type { Node } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { z } from "zod";
import type { AssetPaths } from "./markdown-assets";

const imageAttrs = z.object({
  src: z.string().nullish(),
  alt: z.string().nullish(),
  title: z.string().nullish(),
});

const imageToken = z.object({
  href: z.string(),
  text: z.string().nullish(),
  title: z.string().nullish(),
});

export function createAssetImage(paths: AssetPaths): Node<ImageOptions> {
  return Image.configure({ inline: true }).extend({
    parseMarkdown: (token, helpers) => {
      const { href, text, title } = imageToken.parse(token);

      return helpers.createNode("image", {
        src: paths.toDisplaySrc(href),
        title,
        alt: text,
      });
    },

    renderMarkdown: (node) => {
      const { src, alt, title } = imageAttrs.parse(node.attrs ?? {});
      const href = paths.toStoredSrc(src ?? "");

      return title ? `![${alt ?? ""}](${href} "${title}")` : `![${alt ?? ""}](${href})`;
    },
  });
}
