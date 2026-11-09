/**
 * The site config loader — the one remaining Tina client read. The catalog
 * lives in Vendure (see `src/lib/catalog`); this only fetches Tina's global
 * `config.json` (menus, contact details, logos, SEO) and pipes it through
 * `requestWithMetadata()` so the editor overlay flows in when the page renders
 * inside the admin iframe.
 */
import { requestWithMetadata } from "@tinacms/astro/data";
import client from "../../tina/__generated__/client";
import {
  AssertTrue,
  type IfEquals,
  type RecursiveDiff,
  type RecursivelyNullableToUndefined,
  type RecursivelyRemoveKeys,
  type RecursivelyReplaceType,
  type RecursiveRequired,
} from "./typeHelpers";

import type { InferEntrySchema } from "astro:content";
import type { ImageFunction } from "astro/content/config";
import type { z } from "astro/zod";
import type { GetImageResult } from "astro";
import { resolveImage } from "./assets";
import type { Locale } from "./i18n";

type Image = z.infer<ReturnType<ImageFunction>>;

type CmsConfig = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<
    Awaited<ReturnType<typeof client.queries.config>>["data"]["config"],
    `_${string}`
  >
>;

interface CmsEnhancedConfig extends Omit<CmsConfig, "logo" | "footerLogo" | "id"> {
  logo: GetImageResult | undefined | null;
  footerLogo: GetImageResult | undefined | null;
}

type AstroConfig = RecursivelyReplaceType<
  RecursiveRequired<InferEntrySchema<"config">>,
  Image,
  GetImageResult
>;
type ConfigDiff = RecursiveDiff<CmsEnhancedConfig, AstroConfig>;
AssertTrue<IfEquals<ConfigDiff, never>>();

/**
 * Run a resolvable image reference through Astro's build-time image pipeline
 * (`getImage`) and return the optimized result.
 *
 * The header/footer logos are handed back to Astro's `<Image>`, which needs
 * the full result to re-optimize. Falls back to the original path when it
 * can't resolve to a local asset (e.g. SVGs the pipeline passes through, or
 * unknown references).
 */
async function optimizeImage(path: string, width: number): Promise<GetImageResult | undefined> {
  const optimized = await resolveImage({ src: path, width });
  if (!optimized) {
    return undefined;
  }

  return {
    ...optimized,
    rawOptions: {
      ...optimized.rawOptions,
      src:
        typeof optimized.rawOptions.src === "string"
          ? optimized.rawOptions.src
          : { ...optimized.rawOptions.src },
    },
    options: {
      ...optimized.options,
      src:
        typeof optimized.options.src === "string"
          ? optimized.options.src
          : { ...optimized.options.src },
    },
  };
}

// Render widths (2x for retina) for images consumed outside `<Image>`.
const LOGO_WIDTH = 400; // ~100–200px header logo
const FOOTER_LOGO_WIDTH = 510; // ~255px footer logo

export const getConfig = async (
  locale: Locale
): Promise<RecursiveRequired<CmsEnhancedConfig, GetImageResult>> => {
  const result = await requestWithMetadata(
    client.queries.config({ relativePath: `${locale}/config.json` })
  );
  const { logo, footerLogo } = result.data.config;

  return {
    logo: logo ? await optimizeImage(logo, LOGO_WIDTH) : undefined,
    footerLogo: footerLogo ? await optimizeImage(footerLogo, FOOTER_LOGO_WIDTH) : undefined,
    blogPageURL: result.data.config.blogPageURL ?? undefined,
    contactLink: result.data.config.contactLink ?? undefined,
    copyright: result.data.config.copyright ?? undefined,
    description: result.data.config.description ?? undefined,
    ogLocale: result.data.config.ogLocale ?? undefined,
    pagination: {
      pagerSize: result.data.config.pagination?.pagerSize ?? undefined,
    },
    fabformURL: result.data.config.fabformURL ?? undefined,
    title: result.data.config.title,
    titleAddition: result.data.config.titleAddition ?? undefined,
    titleSeparator: result.data.config.titleSeparator ?? undefined,
    themeColor: result.data.config.themeColor ?? undefined,
    social: (result.data.config.social ?? []).map((social) => ({
      icon: social?.icon ?? undefined,
      url: social?.url ?? undefined,
      weight: social?.weight ?? undefined,
    })),
    mainMenu: (result.data.config.mainMenu ?? []).map((menu) => ({
      name: menu?.name ?? undefined,
      url: menu?.url ?? undefined,
      weight: menu?.weight ?? undefined,
    })),
    sitemapMenu: (result.data.config.sitemapMenu ?? []).map((menu) => ({
      name: menu?.name ?? undefined,
      url: menu?.url ?? undefined,
      weight: menu?.weight ?? undefined,
    })),
    address: {
      phone: result.data.config.address?.phone ?? undefined,
      email: result.data.config.address?.email ?? undefined,
      address: result.data.config.address?.address ?? undefined,
      openingHours: result.data.config.address?.openingHours ?? undefined,
    },
    footerContact: {
      title: result.data.config.footerContact?.title ?? undefined,
      button: result.data.config.footerContact?.button ?? undefined,
      topTitle: result.data.config.footerContact?.topTitle ?? undefined,
    },
  };
};
