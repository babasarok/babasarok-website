import { z } from "zod";
import type {
  FieldVisibilitySchema,
  ProductDefinitionSchema,
  ProductGroupDefinitionSchema,
} from "@babasarok/product-definition";

/**
 * The read-only Tina product-content adapter for the preview seed
 * (docs/roadmap.md principle 6): the site keeps running on Tina until
 * cutover, so the seed parses src/content/product frontmatter into the
 * canonical schema instead of extending anything Tina-side.
 *
 * Text is trimmed on the way in (the canonical schemas reject untrimmed
 * values), and material references are the basename of their
 * `src/content/material/<slug>.md` paths.
 */

const TinaItemSchema = z.object({
  value: z.string(),
  label: z.string().nullish(),
  price: z.number().nullish(),
  tooltip: z.string().nullish(),
});

const TinaMaterialEntrySchema = z.object({
  material_path: z.string(),
  price: z.number().nullish(),
});

const TinaProductImageSchema = z.object({
  image: z.string(),
  description: z.string().nullish(),
});

const TinaFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.string(),
  price: z.number().nullish(),
  optional: z.boolean().nullish(),
  price_unit: z.string().nullish(),
  tooltip: z.string().nullish(),
  color_count: z.string().nullish(),
  allow_custom_value: z.boolean().nullish(),
  regex: z.string().nullish(),
  placeholder: z.string().nullish(),
  items: z.array(TinaItemSchema.nullable()).nullish(),
  materials: z.array(TinaMaterialEntrySchema.nullable()).nullish(),
  depends_on: z
    .object({
      field: z.string().nullish(),
      value: z.string().nullish(),
    })
    .nullish(),
});

export const TinaProductSchema = z.object({
  product_id: z.string(),
  title: z.string(),
  can_be_ordered: z.boolean().nullish(),
  hidden_in_product_list: z.boolean().nullish(),
  type: z.string(),
  price: z.number().nullish(),
  date: z.string().nullish(),
  thumbnail: z.string().nullish(),
  images: z.array(TinaProductImageSchema.nullable()).nullish(),
  categories: z.string().nullish(),
  shortDescription: z.string().nullish(),
  icon: z.string().nullish(),
  length_based_pricing: z.object({ sourceField: z.string().nullish() }).nullish(),
  materials: z
    .object({
      banned_combinations: z
        .array(
          z.object({
            materials: z.array(z.object({ material_path: z.string() }).nullable()).nullish(),
          })
        )
        .nullish(),
    })
    .nullish(),
  fields: z.array(TinaFieldSchema.nullable()).nullish(),
});

export type TinaProduct = z.output<typeof TinaProductSchema>;
export type TinaProductField = z.output<typeof TinaFieldSchema>;

export const TinaProductGroupSchema = z.object({
  title: z.string(),
  discount_amount: z.number().nullish(),
  products: z.array(z.object({ product: z.string() }).nullable()).nullish(),
});

export type TinaProductGroup = z.output<typeof TinaProductGroupSchema>;

/** The canonical definition shape before server-side parsing brands its ids. */
type DefinitionInput = NonNullable<z.input<typeof ProductDefinitionSchema>["fields"]>[number];
type FieldVisibilityInput = z.input<typeof FieldVisibilitySchema>;
type ChoiceInput = Extract<DefinitionInput, { kind: "choice" }>;

/** `src/content/<collection>/<slug>.md` → `<slug>` (the canonical id). */
export function slugFromPath(contentPath: string): string {
  return contentPath.split("/").pop()?.replace(/\.md$/, "") ?? contentPath;
}

function trimmed(value: string | null | undefined): string | undefined {
  const result = value?.trim();
  return result === "" || result === undefined ? undefined : result;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result === undefined || result === "" ? null : result;
}

/**
 * The editorial display fields of the display-field gap (ADR 0010), mapped
 * onto the native Product/Asset custom fields by the preview seed. Kept
 * outside the canonical definition: the configurator model carries none of
 * them.
 */
export interface TinaDisplayContent {
  slug: string;
  popularityRank: number | null;
  shortDescription: string | null;
  tagline: string | null;
  date: string | null;
  thumbnailPath: string | null;
  gallery: Array<{ imagePath: string; description: string | null }>;
  iconPath: string | null;
}

const TinaProductSectionSchema = z.object({
  product_popular_ordering: z.array(z.object({ product: z.string() })).default([]),
});

/** Product file slug → 1-based rank in the section's curated popularity order. */
export function popularityRanks(section: unknown): Map<string, number> {
  const { product_popular_ordering } = TinaProductSectionSchema.parse(section);

  return new Map(
    product_popular_ordering.map((entry, index) => [slugFromPath(entry.product), index + 1])
  );
}

/** Maps the Tina display frontmatter onto the custom-field payload the seed sends. */
export function displayFromTinaProduct(
  source: TinaProduct,
  identity: { slug: string; popularityRank: number | null }
): TinaDisplayContent {
  return {
    ...identity,
    shortDescription: trimmedOrNull(source.shortDescription),
    tagline: trimmedOrNull(source.categories),
    date: trimmedOrNull(source.date),
    thumbnailPath: trimmedOrNull(source.thumbnail),
    gallery: (source.images ?? []).flatMap((entry) =>
      entry === null
        ? []
        : [{ imagePath: entry.image.trim(), description: trimmedOrNull(entry.description) }]
    ),
    iconPath: trimmedOrNull(source.icon),
  };
}

function visibility(field: TinaProductField): FieldVisibilityInput {
  const fieldId = trimmed(field.depends_on?.field);

  if (fieldId === undefined) {
    return { kind: "always" };
  }

  const value = trimmed(field.depends_on?.value);

  if (value === undefined) {
    return { kind: "when-present", fieldId };
  }

  return { kind: "when-equal", fieldId, value };
}

function choiceField(
  field: TinaProductField,
  presentation: ChoiceInput["presentation"]
): DefinitionInput {
  const options = (field.items ?? []).flatMap((item) => {
    if (item === null) {
      return [];
    }

    const id = item.value.trim();
    const tooltip = trimmed(item.tooltip);

    return [
      {
        id,
        label: { hu: trimmed(item.label) ?? id },
        price: item.price ?? 0,
        ...(tooltip === undefined ? {} : { tooltip: { hu: tooltip } }),
      },
    ];
  });

  const tooltip = trimmed(field.tooltip);
  const pattern = trimmed(field.regex);
  const placeholder = trimmed(field.placeholder);
  const customValue =
    field.allow_custom_value === true
      ? {
          ...(pattern === undefined ? {} : { pattern }),
          ...(placeholder === undefined ? {} : { placeholder: { hu: placeholder } }),
        }
      : undefined;

  return {
    kind: "choice",
    id: field.name.trim(),
    label: { hu: field.label.trim() },
    presentation,
    // The field-level `price` is vestigial Tina frontmatter — pricing is per
    // option (the site and the variant plan both read `option.price`), so the
    // canonical model has no such member and the value is dropped here.
    visibility: visibility(field),
    options,
    ...(tooltip === undefined ? {} : { tooltip: { hu: tooltip } }),
    ...(customValue === undefined ? {} : { customValue }),
  };
}

function inputField(field: TinaProductField): DefinitionInput {
  const suggestions = (field.items ?? []).flatMap((item) => {
    if (item === null) {
      return [];
    }

    const value = item.value.trim();

    return [{ value, label: { hu: trimmed(item.label) ?? value } }];
  });

  const tooltip = trimmed(field.tooltip);
  const placeholder = trimmed(field.placeholder);
  const pattern = trimmed(field.regex);

  return {
    kind: "input",
    id: field.name.trim(),
    label: { hu: field.label.trim() },
    visibility: visibility(field),
    required: field.optional !== true,
    price: field.price ?? 0,
    ...(tooltip === undefined ? {} : { tooltip: { hu: tooltip } }),
    ...(placeholder === undefined ? {} : { placeholder: { hu: placeholder } }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(suggestions.length === 0 ? {} : { suggestions }),
  };
}

function toggleField(field: TinaProductField): DefinitionInput {
  const tooltip = trimmed(field.tooltip);

  return {
    kind: "toggle",
    id: field.name.trim(),
    label: { hu: field.label.trim() },
    visibility: visibility(field),
    price: field.price ?? 0,
    ...(tooltip === undefined ? {} : { tooltip: { hu: tooltip } }),
  };
}

function materialField(field: TinaProductField): DefinitionInput {
  const colorCountSource = trimmed(field.color_count);
  const colorCount =
    colorCountSource === undefined || /^-?\d+(?:\.\d+)?$/.test(colorCountSource)
      ? {
          kind: "fixed" as const,
          count: colorCountSource === undefined ? 1 : Number(colorCountSource),
        }
      : { kind: "from-field" as const, fieldId: colorCountSource };

  const tooltip = trimmed(field.tooltip);

  return {
    kind: "material",
    id: field.name.trim(),
    label: { hu: field.label.trim() },
    options: (field.materials ?? []).flatMap((entry) =>
      entry === null
        ? []
        : [
            {
              materialId: slugFromPath(entry.material_path).trim(),
              price: entry.price ?? 0,
            },
          ]
    ),
    colorCount,
    ...(tooltip === undefined ? {} : { tooltip: { hu: tooltip } }),
  };
}

function embroideryField(field: TinaProductField): DefinitionInput {
  const price = field.price ?? 0;
  const tooltip = trimmed(field.tooltip);
  const placeholder = trimmed(field.placeholder);
  const pattern = trimmed(field.regex);

  return {
    kind: "embroidery",
    id: field.name.trim(),
    label: { hu: field.label.trim() },
    visibility: visibility(field),
    pricing:
      field.price_unit === "word"
        ? { kind: "per-word", pricePerWord: price }
        : { kind: "flat", price },
    ...(tooltip === undefined ? {} : { tooltip: { hu: tooltip } }),
    ...(placeholder === undefined ? {} : { placeholder: { hu: placeholder } }),
    ...(pattern === undefined ? {} : { pattern }),
  };
}

function canonicalField(field: TinaProductField): DefinitionInput | undefined {
  switch (field.type) {
    case "input":
      return inputField(field);
    case "select":
      return choiceField(field, "select");
    case "radio":
      return choiceField(field, "radio");
    case "color":
      return choiceField(field, "color");
    case "toggle":
      return toggleField(field);
    case "material":
      return materialField(field);
    case "embroidery":
      return embroideryField(field);
    default:
      return undefined;
  }
}

export type TinaProductParseResult =
  | {
      success: true;
      definition: Omit<z.input<typeof ProductDefinitionSchema>, "revision">;
      /** The Tina `title` — the native Product's name (ADR 0011 decision 1),
       * which the definition no longer carries. */
      name: string;
    }
  | { success: false; errors: string[] };

/**
 * Maps one Tina product frontmatter document onto the canonical definition,
 * minus its revision (the caller computes it once the shape is validated).
 * Unknown product/field types return issues instead of guessing.
 */
export function definitionFromTinaProduct(source: TinaProduct): TinaProductParseResult {
  const errors: string[] = [];
  const fields: DefinitionInput[] = [];

  for (const field of source.fields ?? []) {
    if (field === null) {
      continue;
    }

    const canonical = canonicalField(field);

    if (canonical === undefined) {
      errors.push(`${field.name}: Ismeretlen mező típus: "${field.type}".`);
      continue;
    }

    fields.push(canonical);
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const sourceFieldId = trimmed(source.length_based_pricing?.sourceField);

  return {
    success: true,
    name: source.title.trim(),
    definition: {
      id: source.product_id.trim(),
      orderable: source.can_be_ordered ?? false,
      hiddenInProductList: source.hidden_in_product_list ?? false,
      basePrice: source.price ?? 0,
      pricing: sourceFieldId === undefined ? { kind: "unit" } : { kind: "length", sourceFieldId },
      fields,
      forbiddenMaterialCombinations: (source.materials?.banned_combinations ?? []).map(
        (combination) =>
          combination.materials
            ?.filter((member) => member !== null)
            .map((member) => slugFromPath(member.material_path).trim()) ?? []
      ),
    },
  };
}

export type TinaProductGroupParseResult =
  | { success: true; group: z.input<typeof ProductGroupDefinitionSchema> }
  | { success: false; errors: string[] };

/**
 * Maps one Tina product-group frontmatter document onto the canonical group
 * definition. The id is the content file's slug; member product paths resolve
 * through the file→product-id map built from the product frontmatter, since
 * filenames and product ids diverge in a few legacy files.
 */
export function groupDefinitionFromTinaProductGroup(
  source: TinaProductGroup,
  id: string,
  productIdByFile: ReadonlyMap<string, string>
): TinaProductGroupParseResult {
  const errors: string[] = [];
  const productIds = (source.products ?? []).flatMap((member) => {
    if (member === null) {
      return [];
    }

    const productId = productIdByFile.get(slugFromPath(member.product.trim()));

    if (productId === undefined) {
      errors.push(`Ismeretlen termék hivatkozás: ${member.product}`);
      return [];
    }

    return [productId];
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const label = source.title.trim();
  const discount = source.discount_amount ?? 0;

  return {
    success: true,
    group:
      discount > 0
        ? { kind: "discounted-set", id, label, discount, productIds }
        : { kind: "related-items", id, label, productIds },
  };
}
