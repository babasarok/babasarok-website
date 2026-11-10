import { VENDURE_LANGUAGE_CODE, type Locale } from "@/lib/i18n";
import { ASSET_BASE } from "@/lib/vendure/client";
import { imageUrl } from "@/lib/vendure/imageUrl";
import { getMaterial, getProduct } from "./index";
import type { CatalogMaterial, CatalogProductDetail } from "./mappers";

/**
 * Link-preview and search crawlers read only the server HTML. Missing one here
 * costs that crawler the page's own title and image, nothing more.
 */
const CRAWLER_USER_AGENT =
  /googlebot|google-inspectiontool|bingbot|applebot|duckduckbot|yandex|baiduspider|petalbot|facebookexternalhit|facebot|meta-externalagent|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|pinterest|redditbot|skypeuripreview|embedly|vkshare|mastodon/i;

export function isCrawler(userAgent: string | null): boolean {
  return userAgent !== null && CRAWLER_USER_AGENT.test(userAgent);
}

export type CatalogPage = { kind: "product" | "material"; slug: string; locale: Locale };

export type CrawlerMeta =
  | { kind: "visitor" }
  | { kind: "found"; title: string; description: string | undefined; image: string | undefined }
  | { kind: "missing" }
  | { kind: "unavailable" };

export interface CrawlerMetaDeps {
  getProduct: (slug: string, languageCode: string) => Promise<CatalogProductDetail | null>;
  getMaterial: (slug: string, languageCode: string) => Promise<CatalogMaterial | null>;
  assetBase: string;
}

const defaultDeps: CrawlerMetaDeps = {
  getProduct: (slug, languageCode) => getProduct(slug, undefined, languageCode),
  getMaterial: (slug, languageCode) => getMaterial(slug, undefined, languageCode),
  assetBase: ASSET_BASE,
};

function previewImage(source: string | null, assetBase: string): string | undefined {
  if (source === null) {
    return undefined;
  }

  return imageUrl(source, "hero-md", assetBase);
}

async function loadMeta(
  page: CatalogPage,
  deps: CrawlerMetaDeps
): Promise<Omit<Extract<CrawlerMeta, { kind: "found" }>, "kind"> | null> {
  const languageCode = VENDURE_LANGUAGE_CODE[page.locale];

  if (page.kind === "product") {
    const product = await deps.getProduct(page.slug, languageCode);

    if (product === null) {
      return null;
    }

    return {
      title: product.name,
      description: product.shortDescription ?? undefined,
      image: previewImage(product.gallery.at(0)?.url ?? product.thumbnailUrl, deps.assetBase),
    };
  }

  const material = await deps.getMaterial(page.slug, languageCode);

  if (material === null) {
    return null;
  }

  return {
    title: material.label,
    description: material.subtitle || undefined,
    image: previewImage(material.thumbnailUrl, deps.assetBase),
  };
}

/**
 * Visitors get the page shell without waiting for the backend; crawlers wait
 * for the item's title, description and image (or learn it does not exist).
 */
export async function crawlerMeta(
  request: Request,
  page: CatalogPage,
  deps: CrawlerMetaDeps = defaultDeps
): Promise<CrawlerMeta> {
  if (!isCrawler(request.headers.get("user-agent"))) {
    return { kind: "visitor" };
  }

  try {
    const meta = await loadMeta(page, deps);

    if (meta === null) {
      return { kind: "missing" };
    }

    return { kind: "found", ...meta };
  } catch {
    return { kind: "unavailable" };
  }
}

/** What a crawler gets instead of the page when the item cannot be shown. */
export function crawlerFailure(meta: CrawlerMeta): Response | null {
  if (meta.kind === "missing") {
    return new Response(null, { status: 404 });
  }

  if (meta.kind === "unavailable") {
    return new Response(null, { status: 503, headers: { "Retry-After": "120" } });
  }

  return null;
}

export interface PageHead {
  title: string;
  description: string | undefined;
  image: string | undefined;
}

/** The item's own head for crawlers; the section's generic title for visitors. */
export function pageHead(meta: CrawlerMeta, fallbackTitle: string): PageHead {
  if (meta.kind === "found") {
    return { title: meta.title, description: meta.description, image: meta.image };
  }

  return { title: fallbackTitle, description: undefined, image: undefined };
}
