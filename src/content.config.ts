/**
 * Content is sourced from TinaCMS (see `src/lib/data.ts`), not Astro's
 * content layer, so most collections are unused at runtime. We declare
 * `config` to stop Astro auto-generating it as a Markdown collection:
 * `src/content/config` holds JSON (Tina's global config), so the default
 * Markdown glob finds nothing and warns. Pointing it at JSON silences that.
 *
 * `product` is a real Astro content collection: the landing product grid
 * queries it with `getCollection('product')`. Its schema validates the fields
 * the site renders (including the per-product `table` and gallery `images`);
 * unused product-configurator frontmatter (materials, fields, pricing) is
 * stripped by Zod.
 *
 * `blog` is a real Astro content collection: the landing blog preview queries
 * it with `getCollection('blog')`. `_index.md` is excluded from the glob.
 *
 * `material` backs the `/material` list page. `_index.html` is excluded by the
 * `*.md` glob.
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import z from "astro/zod";

const config = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "src/content/config" }),
});

const product = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/product" }),
  schema: z.object({
    title: z.string(),
    product_id: z.string().optional(),
    categories: z.string().optional(),
    date: z.coerce.date().optional(),
    thumbnail: z.string().optional(),
    shortDescription: z.string().optional(),
    hidden_in_product_list: z.boolean().optional(),
    table: z
      .array(
        z.object({
          title: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
        })
      )
      .optional(),
    images: z
      .array(
        z.object({
          image: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .optional(),
  }),
});

const blog = defineCollection({
  loader: glob({
    pattern: "!(_index)*.md",
    base: "src/content/blog",
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    featureImage: z.string().optional(),
    postImage: z.string().optional(),
    categories: z.string().optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
  }),
});

const material = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/material" }),
  schema: z.object({
    title: z.string(),
    label: z.string().optional(),
    material_id: z.string().optional(),
    thumbnail: z.string().optional(),
    categories: z.string().optional(),
    shortDescription: z.string().optional(),
    colors: z
      .array(
        z.object({
          color_id: z.string().optional(),
          label: z.string().optional(),
          hex: z.string().optional(),
          image: z.string().optional(),
        })
      )
      .optional(),
  }),
});

const contact = defineCollection({
  loader: glob({ pattern: "_index.md", base: "src/content/contact" }),
  schema: z.object({
    title: z.string(),
    breadcrumb: z.string().optional(),
  }),
});

export const collections = { config, product, blog, material, contact };
