import { describe, expect, it, vi } from "vitest";
import materialsFixture from "./__fixtures__/materials.json";
import productFixture from "./__fixtures__/product.json";
import {
  crawlerFailure,
  crawlerMeta,
  isCrawler,
  pageHead,
  type CrawlerMetaDeps,
} from "./crawlerMeta";
import { toMaterial, toProductDetail } from "./mappers";
import { MaterialsResponseSchema, ProductResponseSchema } from "./schemas";

const FACEBOOK = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0";

const productRow = ProductResponseSchema.parse(productFixture).product;
const product = productRow === null ? null : toProductDetail(productRow);
const material = toMaterial(MaterialsResponseSchema.parse(materialsFixture).materials[0]);

function requestFrom(userAgent: string): Request {
  return new Request("https://babasarok.net/product/tornazsak/", {
    headers: { "user-agent": userAgent },
  });
}

function depsWith(overrides: Partial<CrawlerMetaDeps> = {}): CrawlerMetaDeps {
  return {
    getProduct: vi.fn(() => Promise.resolve(product)),
    getMaterial: vi.fn(() => Promise.resolve(material)),
    assetBase: "https://api.test/assets/",
    ...overrides,
  };
}

describe("isCrawler", () => {
  it("recognises search and link-preview crawlers", () => {
    expect(isCrawler(FACEBOOK)).toBe(true);
    expect(isCrawler(GOOGLEBOT)).toBe(true);
    expect(isCrawler("Twitterbot/1.0")).toBe(true);
    expect(isCrawler("WhatsApp/2.23.20.0")).toBe(true);
  });

  it("treats browsers and a missing user agent as visitors", () => {
    expect(isCrawler(FIREFOX)).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});

describe("crawlerMeta", () => {
  const page = { kind: "product", slug: "tornazsak", locale: "en" } as const;

  it("never waits for the backend for a visitor", async () => {
    const deps = depsWith();

    expect(await crawlerMeta(requestFrom(FIREFOX), page, deps)).toEqual({ kind: "visitor" });
    expect(deps.getProduct).not.toHaveBeenCalled();
  });

  it("gives a crawler the product's title, description and preview image", async () => {
    const deps = depsWith();
    const meta = await crawlerMeta(requestFrom(FACEBOOK), page, deps);

    expect(deps.getProduct).toHaveBeenCalledWith("tornazsak", "en");
    expect(meta).toMatchObject({ kind: "found", title: product?.name });
    expect(meta.kind === "found" && meta.image).toMatch(/\/assets\/source\/.*preset=hero-md/);
  });

  it("gives a crawler the material's label and subtitle", async () => {
    const meta = await crawlerMeta(
      requestFrom(GOOGLEBOT),
      { kind: "material", slug: material.slug, locale: "hu" },
      depsWith()
    );

    expect(meta).toMatchObject({ kind: "found", title: material.label });
  });

  it("reports an unknown slug as missing", async () => {
    const deps = depsWith({ getProduct: vi.fn(() => Promise.resolve(null)) });

    expect(await crawlerMeta(requestFrom(FACEBOOK), page, deps)).toEqual({ kind: "missing" });
  });

  it("reports a failing backend as unavailable", async () => {
    const deps = depsWith({ getProduct: vi.fn(() => Promise.reject(new Error("down"))) });

    expect(await crawlerMeta(requestFrom(FACEBOOK), page, deps)).toEqual({ kind: "unavailable" });
  });
});

describe("crawlerFailure", () => {
  it("answers a missing item with 404 and a failing backend with 503", () => {
    expect(crawlerFailure({ kind: "missing" })?.status).toBe(404);
    expect(crawlerFailure({ kind: "unavailable" })?.status).toBe(503);
  });

  it("lets visitors and found items through to the page", () => {
    expect(crawlerFailure({ kind: "visitor" })).toBeNull();
    expect(
      crawlerFailure({ kind: "found", title: "x", description: undefined, image: undefined })
    ).toBeNull();
  });
});

describe("pageHead", () => {
  it("uses the item's meta when found and the section title otherwise", () => {
    expect(
      pageHead({ kind: "found", title: "Tornazsák", description: "d", image: "i" }, "Termékek")
    ).toEqual({ title: "Tornazsák", description: "d", image: "i" });
    expect(pageHead({ kind: "visitor" }, "Termékek")).toEqual({
      title: "Termékek",
      description: undefined,
      image: undefined,
    });
  });
});
