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
import { EMBROIDERY_PRICE_UNIT_VALUES, PRODUCT_FIELD_TYPE_VALUES } from "./lib/productFieldTypes";

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
  loader: glob({ pattern: "config.json", base: "src/content/config" }),
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const materialValidator = ({ image }: SchemaContext) =>
  z.object({
    material_id: z.string(),
    label: z.string(),
    categories: z.string().optional().nullable(),
    shortDescription: z.string().optional().nullable(),
    thumbnail: image().optional().nullable(),
    colors: z
      .array(
        z.object({
          color_id: z.string(),
          label: z.string(),
          hex: z.string().optional().nullable(),
          image: image().optional().nullable(),
        })
      )
      .optional()
      .nullable(),
  });

/**
 * Product `fields` share one shape with a `type` discriminant drawn from the
 * central PRODUCT_FIELD_TYPES list. The runtime `Field` type (types.svelte.ts)
 * turns this into a per-type discriminated union so each kind can carry its own
 * value shape (see docs/embroidery-field-plan.md).
 */
const productFieldBaseShape = {
  name: z.string(),
  price: z.number().optional().nullable(),
  price_unit: z.enum(EMBROIDERY_PRICE_UNIT_VALUES).optional().nullable(),
  label: z.string(),
  optional: z.boolean().optional().nullable(),
  allow_custom_value: z.boolean().optional().nullable(),
  regex: z.string().optional().nullable(),
  placeholder: z.string().optional().nullable(),
  tooltip: z.string().optional().nullable(),
  depends_on: z
    .object({
      field: z.string().optional().nullable(),
      value: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  items: z
    .array(
      z
        .object({
          value: z.string(),
          label: z.string().optional().nullable(),
          price: z.number().optional().nullable(),
          tooltip: z.string().optional().nullable(),
        })
        .optional()
        .nullable()
    )
    .optional()
    .nullable(),
};

const productFieldSchema = z.object({
  type: z.enum(PRODUCT_FIELD_TYPE_VALUES),
  ...productFieldBaseShape,
});

const product = defineCollection({
  loader: glob({ pattern: "*.md", base: "src/content/product" }),
  schema: ({ image }) =>
    z.object({
      product_id: z.string(),
      title: z.string(),
      hidden_in_product_list: z.boolean().optional().nullable(),
      can_be_ordered: z.boolean().optional().nullable(),
      categories: z.string().optional().nullable(),
      date: z.coerce.date().optional().nullable(),
      thumbnail: image().optional().nullable(),
      shortDescription: z.string().optional().nullable(),
      icon: image().optional().nullable(),
      length_based_pricing: z
        .object({
          sourceField: z.string(),
        })
        .optional()
        .nullable(),
      price: z.number(),
      discount: z.number().optional().nullable(),
      discount_valid_until: z.coerce.date().optional().nullable(),
      images: z
        .array(
          z
            .object({
              image: image().optional().nullable(),
              description: z.string().optional().nullable(),
            })
            .optional()
            .nullable()
        )
        .optional()
        .nullable(),
      table: z
        .array(
          z
            .object({
              title: z.string().optional().nullable(),
              description: z.string().optional().nullable(),
            })
            .optional()
            .nullable()
        )
        .optional()
        .nullable(),
      materials: z
        .object({
          material_required_count: z.number(),
          materials: z
            .array(
              z
                .object({
                  color_count: z.string(),
                  price: z.number(),
                  material_path: z.string(),
                })
                .optional()
                .nullable()
            )
            .optional()
            .nullable(),
          banned_combinations: z
            .array(
              z
                .object({
                  materials: z
                    .array(
                      z
                        .object({ material_path: z.string().optional().nullable() })
                        .optional()
                        .nullable()
                    )
                    .optional()
                    .nullable(),
                })
                .optional()
                .nullable()
            )
            .optional()
            .nullable(),
        })
        .optional()
        .nullable(),
      fields: z.array(productFieldSchema.optional().nullable()).optional().nullable(),
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
  loader: glob({ pattern: "*.md", base: "src/content/delivery_method" }),
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

const embroidery = defineCollection({
  loader: glob({ pattern: "embroidery.json", base: "src/content/config" }),
  schema: ({ image }) =>
    z.object({
      colors: z
        .array(
          z.object({
            color_id: z.string(),
            label: z.string(),
            hex: z.string().optional().nullable(),
            image: image().optional().nullable(),
          })
        )
        .optional()
        .nullable(),
    }),
});

export const collections = {
  config,
  embroidery,
  product,
  blog,
  material,
  contact,
  heroBlock,
  servicesBlock,
  aboutBlock,
  deliveryMethod,
};
