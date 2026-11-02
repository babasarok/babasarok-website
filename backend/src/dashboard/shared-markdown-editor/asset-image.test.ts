import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, test } from "vitest";
import { createAssetImage } from "./asset-image";
import {
  assetPrefixOf,
  isBlankMarkdown,
  toDisplaySrc,
  toStoredSrc,
  type AssetPaths,
} from "./markdown-assets";

const prefix = "https://api.test/assets/";
const paths: AssetPaths = {
  toDisplaySrc: (href) => toDisplaySrc(href, prefix),
  toStoredSrc: (src) => toStoredSrc(src, prefix),
};

function manager(): MarkdownManager {
  return new MarkdownManager({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), createAssetImage(paths)],
  });
}

describe("asset paths", () => {
  test("derives the prefix from an API source url", () => {
    expect(assetPrefixOf("https://api.test/assets/source/c3/foo.jpg")).toBe(prefix);
    expect(assetPrefixOf("https://x.test/a.png")).toBeNull();
  });

  test("strips only the known prefix", () => {
    expect(toStoredSrc("https://api.test/assets/source/c3/foo.jpg", prefix)).toBe(
      "source/c3/foo.jpg"
    );
    expect(toStoredSrc("https://other.test/assets/source/c3/foo.jpg", prefix)).toBe(
      "https://other.test/assets/source/c3/foo.jpg"
    );
    expect(toStoredSrc("https://api.test/assets/preview/c3/foo.jpg", prefix)).toBe(
      "https://api.test/assets/preview/c3/foo.jpg"
    );
    expect(toStoredSrc("https://api.test/assets/source/c3/foo.jpg")).toBe(
      "https://api.test/assets/source/c3/foo.jpg"
    );
  });

  test("prefixes only relative asset paths for display", () => {
    expect(toDisplaySrc("source/c3/foo.jpg", prefix)).toBe(`${prefix}source/c3/foo.jpg`);
    expect(toDisplaySrc("https://x.test/a.png", prefix)).toBe("https://x.test/a.png");
    expect(toDisplaySrc("source/c3/foo.jpg")).toBe("source/c3/foo.jpg");
  });

  test("blank detection", () => {
    expect(isBlankMarkdown(" \n")).toBe(true);
    expect(isBlankMarkdown("a")).toBe(false);
  });
});

describe("markdown <-> editor document", () => {
  test("relative asset images display with the prefix and serialize back relative", () => {
    const md = manager();
    const doc = md.parse("![Logo](source/c3/foo.jpg)");

    expect(doc.content?.[0].attrs).toMatchObject({ src: `${prefix}source/c3/foo.jpg` });
    expect(md.serialize(doc)).toBe("![Logo](source/c3/foo.jpg)");
  });

  test("external images, headings, lists and links survive", () => {
    const md = manager();
    const source =
      "# Title\n\n- one\n- two\n\n[site](https://x.test)\n\n![a](https://x.test/a.png)";

    expect(md.serialize(md.parse(source))).toBe(source);
  });
});
