import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, test } from "vitest";
import { createAssetImage } from "./asset-image";
import { assetIdsIn, assetRef, isBlankMarkdown, parseAssetRef } from "./markdown-assets";

const urls = new Map([["7", "https://assets.test/source/7.png"]]);

function manager(): MarkdownManager {
  return new MarkdownManager({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      createAssetImage((id) => urls.get(id)),
    ],
  });
}

describe("asset refs", () => {
  test("round-trip and extraction", () => {
    expect(parseAssetRef(assetRef("12"))).toBe("12");
    expect(parseAssetRef("https://x.test/a.png")).toBeNull();
    expect(parseAssetRef("asset:")).toBeNull();
    expect(assetIdsIn('![a](asset:1) text ![b](asset:2 "t") ![c](asset:1) ![d](http://x)')).toEqual(
      ["1", "2"]
    );
  });

  test("blank detection", () => {
    expect(isBlankMarkdown(" \n")).toBe(true);
    expect(isBlankMarkdown("a")).toBe(false);
  });
});

describe("markdown <-> editor document", () => {
  test("asset images show the resolved url and serialize back to asset:<id>", () => {
    const md = manager();
    const doc = md.parse("![Logo](asset:7)");
    const image = doc.content?.[0];

    expect(image?.attrs).toMatchObject({ src: urls.get("7"), assetId: "7", alt: "Logo" });
    expect(md.serialize(doc)).toBe("![Logo](asset:7)");
  });

  test("an unresolvable asset keeps its id", () => {
    const md = manager();

    expect(md.serialize(md.parse("![](asset:99)"))).toBe("![](asset:99)");
  });

  test("external images, headings, lists and links survive", () => {
    const md = manager();
    const source =
      "# Title\n\n- one\n- two\n\n[site](https://x.test)\n\n![a](https://x.test/a.png)";

    expect(md.serialize(md.parse(source))).toBe(source);
  });
});
