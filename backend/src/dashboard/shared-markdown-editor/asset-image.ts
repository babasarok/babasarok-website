import type { Node } from "@tiptap/core";
import Image, { type ImageOptions } from "@tiptap/extension-image";
import { z } from "zod";
import { assetRef, parseAssetRef } from "./markdown-assets";

const imageAttrs = z.object({
  src: z.string().nullish(),
  alt: z.string().nullish(),
  title: z.string().nullish(),
  assetId: z.string().nullish(),
});

const imageToken = z.object({
  href: z.string(),
  text: z.string().nullish(),
  title: z.string().nullish(),
});

export function createAssetImage(
  displayUrlOf: (assetId: string) => string | undefined
): Node<ImageOptions> {
  return Image.configure({ inline: true }).extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        assetId: { default: null, rendered: false },
      };
    },

    parseMarkdown: (token, helpers) => {
      const { href, text, title } = imageToken.parse(token);
      const assetId = parseAssetRef(href);

      return helpers.createNode("image", {
        src: assetId ? (displayUrlOf(assetId) ?? href) : href,
        assetId,
        title,
        alt: text,
      });
    },

    renderMarkdown: (node) => {
      const { assetId, src, alt, title } = imageAttrs.parse(node.attrs ?? {});
      const href = assetId ? assetRef(assetId) : (src ?? "");

      return title ? `![${alt ?? ""}](${href} "${title}")` : `![${alt ?? ""}](${href})`;
    },
  });
}
