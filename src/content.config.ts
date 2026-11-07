/**
 * Astro content collections over the Tina-edited non-catalog content
 * (sections, blog, contact, adatvédelem, terms, checkout copy, site config).
 * The catalog itself lives in Vendure — the site reads it through
 * `src/lib/catalog` (see ADR 0012) — so there are no product/material
 * collections here anymore.
 *
 * `config` is declared to stop Astro auto-generating it as a Markdown
 * collection: `src/content/config` holds JSON (Tina's global config), so the
 * default Markdown glob finds nothing and warns. Pointing it at JSON silences
 * that.
 *
 * Every collection is directory-localized (ADR 0015 decision 4): the locale
 * lives as the first path segment under the collection root
 * (`src/content/<collection>/<locale>/…`), and consumers pick their locale's
 * entry through the helpers in `src/lib/i18n.ts`.
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import z from "astro/zod";
import { cookieCategorySchema } from "./lib/cookie";

const heroBlock = defineCollection({
  loader: glob({ pattern: "**/hero.md", base: "src/content/sections" }),
  schema: ({ image }) =>
    z.object({
      topTitle: z.string(),
      buttonName: z.string().optional(),
      buttonURL: z.string().optional(),
      image: image().optional(),
      enable: z.boolean().optional(),
    }),
});

const servicesBlock = defineCollection({
  loader: glob({ pattern: "**/service.json", base: "src/content/sections" }),
  schema: ({ image }) =>
    z.object({
      enable: z.boolean().optional(),
      title: z.string(),
      topTitle: z.string().optional(),
      service: z.array(
        z.object({
          content: z.string(),
          image: image(),
        })
      ),
    }),
});

const aboutBlock = defineCollection({
  loader: glob({ pattern: "**/about.json", base: "src/content/sections" }),
  schema: ({ image }) =>
    z.object({
      enable: z.boolean().optional(),
      title: z.string(),
      content: z.string(),
      image: image().optional(),
      button1Name: z.string().optional(),
      button1Target: z.string().optional(),
      button2Name: z.string().optional(),
      button2Target: z.string().optional(),
    }),
});

const blogSectionBlock = defineCollection({
  loader: glob({ pattern: "**/blog.json", base: "src/content/sections" }),
  schema: z.object({
    enable: z.boolean().optional(),
    topTitle: z.string().optional(),
    title: z.string(),
    buttonName: z.string().optional(),
    buttonTarget: z.string().optional(),
  }),
});

const config = defineCollection({
  loader: glob({ pattern: "**/config.json", base: "src/content/config" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      logo: image().optional().nullable(),
      footerLogo: image().optional().nullable(),
      description: z.string().optional().nullable(),
      blogPageURL: z.string().optional().nullable(),
      contactLink: z.string().optional().nullable(),
      copyright: z.string().optional().nullable(),
      fabformURL: z.string().optional().nullable(),
      address: z
        .object({
          phone: z.string().optional().nullable(),
          email: z.string().optional().nullable(),
          address: z.string().optional().nullable(),
          openingHours: z.string().optional().nullable(),
        })
        .optional()
        .nullable(),
      footerContact: z
        .object({
          title: z.string().optional().nullable(),
          button: z.string().optional().nullable(),
          topTitle: z.string().optional().nullable(),
        })
        .optional()
        .nullable(),
      social: z
        .array(
          z
            .object({
              icon: z.string().optional().nullable(),
              url: z.string().optional().nullable(),
              weight: z.number().optional().nullable(),
            })
            .optional()
            .nullable()
        )
        .optional()
        .nullable(),
      themeColor: z.string().optional().nullable(),
      titleAddition: z.string().optional().nullable(),
      titleSeparator: z.string().optional().nullable(),
      mainMenu: z
        .array(
          z
            .object({
              name: z.string().optional().nullable(),
              url: z.string().optional().nullable(),
              weight: z.number().optional().nullable(),
            })
            .optional()
            .nullable()
        )
        .optional()
        .nullable(),
      sitemapMenu: z
        .array(
          z
            .object({
              name: z.string().optional().nullable(),
              url: z.string().optional().nullable(),
              weight: z.number().optional().nullable(),
            })
            .optional()
            .nullable()
        )
        .optional()
        .nullable(),
      ogLocale: z.string().optional().nullable(),
      pagination: z
        .object({
          pagerSize: z.number().optional().nullable(),
        })
        .optional()
        .nullable(),
    }),
});

const blog = defineCollection({
  loader: glob({
    pattern: "!(_index)*.md",
    base: "src/content/blog",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date().optional(),
      featureImage: image().optional(),
      postImage: image().optional(),
      categories: z.string().optional(),
      tags: z.union([z.array(z.string()), z.string()]).optional(),
    }),
});

const contact = defineCollection({
  loader: glob({ pattern: "**/_index.md", base: "src/content/contact" }),
  schema: z.object({
    title: z.string(),
    breadcrumb: z.string().optional(),
  }),
});

const adatvedelem = defineCollection({
  loader: glob({ pattern: "**/_index.md", base: "src/content/adatvedelem" }),
  schema: z.object({
    title: z.string(),
    cookieBannerHeading: z.string(),
    cookieBannerText: z.string(),
    cookieCategories: z.array(cookieCategorySchema),
  }),
});

const checkout = defineCollection({
  loader: glob({ pattern: "**/index.md", base: "src/content/checkout" }),
  schema: z.object({
    basket_note: z.string().optional(),
    contact_heading: z.string(),
    basket_heading: z.string(),
    message_heading: z.string(),
  }),
});

const terms = defineCollection({
  loader: glob({ pattern: "**/index.md", base: "src/content/terms" }),
  schema: z.object({
    title: z.string(),
  }),
});

export const collections = {
  config,
  blog,
  contact,
  adatvedelem,
  heroBlock,
  servicesBlock,
  aboutBlock,
  blogSectionBlock,
  checkout,
  terms,
};
