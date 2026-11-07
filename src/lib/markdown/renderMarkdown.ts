import { Marked } from "marked";
import { imageUrl } from "@/lib/vendure/imageUrl";

const ASSET_PATH = /^source\/[^/]{2}\/[^/]+$/;
const SAFE_LINK = /^(https?:|mailto:|tel:|[^:]*$)/i;
const IMAGE_PRESET = "hero-md";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderMarkdown(markdown: string, assetBase: string): string {
  const marked = new Marked({
    renderer: {
      html: ({ text }) => escapeHtml(text),
    },
    walkTokens: (token) => {
      if (token.type !== "image" && token.type !== "link") {
        return;
      }

      const href: unknown = token.href;

      if (typeof href !== "string") {
        return;
      }

      if (token.type === "image" && ASSET_PATH.test(href)) {
        token.href = imageUrl(href, IMAGE_PRESET, assetBase);
        return;
      }

      if (!SAFE_LINK.test(href)) {
        token.href = "";
      }
    },
  });

  return marked.parse(markdown, { async: false });
}
