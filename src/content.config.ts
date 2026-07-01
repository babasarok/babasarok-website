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
import type { SchemaContext } from "astro/content/config";

const heroBlock = defineCollection({
  loader: glob({ pattern: "hero.md", base: "src/content/sections" }),
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
  loader: glob({ pattern: "service.json", base: "src/content/sections" }),
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
  loader: glob({ pattern: "about.json", base: "src/content/sections" }),
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

const config = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "src/content/config" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      logo: image().optional(),
      footerLogo: image().optional(),
      favicon: image().optional(),
      description: z.string().optional(),
      keywords: z.string().optional(),
    }),
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const materialValidator = ({ image }: SchemaContext) =>
  z.object({
    material_id: z.string(),
    label: z.string(),
    categories: z.string().optional(),
    shortDescription: z.string().optional(),
    thumbnail: image().optional(),
    colors: z
      .array(
        z.object({
          color_id: z.string(),
          label: z.string(),
          hex: z.string().optional(),
          image: image().optional(),
        })
      )
      .optional(),
  });

const product = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/product" }),
  schema: ({ image }) =>
    z.object({
      product_id: z.string(),
      title: z.string(),
      hidden_in_product_list: z.boolean().optional(),
      can_be_ordered: z.boolean().optional(),
      categories: z.string().optional(),
      date: z.coerce.date().optional(),
      thumbnail: image().optional(),
      shortDescription: z.string().optional(),
      icon: image().optional(),
      priced_by_length: z.boolean().optional(),
      price: z.number().optional(),
      discount: z.number().optional(),
      discount_valid_until: z.coerce.date().optional(),
      images: z
        .array(
          z
            .object({
              image: image().optional(),
              description: z.string().optional(),
            })
            .optional()
        )
        .optional(),
      image: image().optional(),
      table: z
        .array(
          z
            .object({
              title: z.string().optional(),
              description: z.string().optional(),
            })
            .optional()
        )
        .optional(),
      materials: z
        .object({
          material_required_count: z.number().optional(),
          materials: z
            .array(
              z
                .object({
                  color_count: z.string().optional(),
                  price: z.number().optional(),
                  material_path: materialValidator({ image }),
                })
                .optional()
            )
            .optional(),
          banned_combinations: z
            .array(
              z
                .object({
                  materials: z
                    .array(
                      z
                        .object({ material_path: materialValidator({ image }).optional() })
                        .optional()
                    )
                    .optional(),
                })
                .optional()
            )
            .optional(),
        })
        .optional(),
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

const material = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/material" }),
  schema: materialValidator,
});

const deliveryMethod = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/delivery-method" }),
  schema: z.object({
    delivery_name: z.string(),
    name: z.string(),
    price: z.number(),
  }),
});

const contact = defineCollection({
  loader: glob({ pattern: "_index.md", base: "src/content/contact" }),
  schema: z.object({
    title: z.string(),
    breadcrumb: z.string().optional(),
  }),
});

export const collections = {
  config,
  product,
  blog,
  material,
  contact,
  heroBlock,
  servicesBlock,
  aboutBlock,
  deliveryMethod,
};
