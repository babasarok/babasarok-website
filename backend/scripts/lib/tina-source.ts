import { z } from "zod";
import type { FieldVisibilitySchema, ProductDefinitionSchema } from "@babasarok/product-definition";
import { ProductTypeSchema } from "@babasarok/product-definition";

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
  type: z.string(),
  price: z.number().nullish(),
  discount: z.number().nullish(),
  discount_valid_until: z.string().nullish(),
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

/** The canonical definition shape before server-side parsing brands its ids. */
type DefinitionInput = NonNullable<z.input<typeof ProductDefinitionSchema>["fields"]>[number];
type FieldVisibilityInput = z.input<typeof FieldVisibilitySchema>;
type ChoiceInput = Extract<DefinitionInput, { kind: "choice" }>;

/** `src/content/material/wellsoft.md` → `wellsoft` (the canonical MaterialId). */
export function materialSlugFromPath(materialPath: string): string {
  return materialPath.split("/").pop()?.replace(/\.md$/, "") ?? materialPath;
}

function trimmed(value: string | null | undefined): string | undefined {
  const result = value?.trim();
  return result === "" || result === undefined ? undefined : result;
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
        label: trimmed(item.label) ?? id,
        price: item.price ?? 0,
        ...(tooltip === undefined ? {} : { tooltip }),
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
          ...(placeholder === undefined ? {} : { placeholder }),
        }
      : undefined;

  return {
    kind: "choice",
    id: field.name.trim(),
    label: field.label.trim(),
    presentation,
    price: field.price ?? 0,
    visibility: visibility(field),
    options,
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(customValue === undefined ? {} : { customValue }),
  };
}

function inputField(field: TinaProductField): DefinitionInput {
  const suggestions = (field.items ?? []).flatMap((item) => {
    if (item === null) {
      return [];
    }

    const value = item.value.trim();

    return [{ value, label: trimmed(item.label) ?? value }];
  });

  const tooltip = trimmed(field.tooltip);
  const placeholder = trimmed(field.placeholder);
  const pattern = trimmed(field.regex);

  return {
    kind: "input",
    id: field.name.trim(),
    label: field.label.trim(),
    visibility: visibility(field),
    required: field.optional !== true,
    price: field.price ?? 0,
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(suggestions.length === 0 ? {} : { suggestions }),
  };
}

function toggleField(field: TinaProductField): DefinitionInput {
  const tooltip = trimmed(field.tooltip);

  return {
    kind: "toggle",
    id: field.name.trim(),
    label: field.label.trim(),
    visibility: visibility(field),
    price: field.price ?? 0,
    ...(tooltip === undefined ? {} : { tooltip }),
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
    label: field.label.trim(),
    options: (field.materials ?? []).flatMap((entry) =>
      entry === null
        ? []
        : [
            {
              materialId: materialSlugFromPath(entry.material_path).trim(),
              price: entry.price ?? 0,
            },
          ]
    ),
    colorCount,
    ...(tooltip === undefined ? {} : { tooltip }),
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
    label: field.label.trim(),
    visibility: visibility(field),
    pricing:
      field.price_unit === "word"
        ? { kind: "per-word", pricePerWord: price }
        : { kind: "flat", price },
    ...(tooltip === undefined ? {} : { tooltip }),
    ...(placeholder === undefined ? {} : { placeholder }),
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
    }
  | { success: false; errors: string[] };

/**
 * Maps one Tina product frontmatter document onto the canonical definition,
 * minus its revision (the caller computes it once the shape is validated).
 * Unknown product/field types return issues instead of guessing.
 */
export function definitionFromTinaProduct(source: TinaProduct): TinaProductParseResult {
  const errors: string[] = [];
  const productType = ProductTypeSchema.safeParse(source.type);

  if (!productType.success) {
    errors.push(`${source.product_id}: Ismeretlen termék típus: "${source.type}".`);
  }

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

  if (errors.length > 0 || !productType.success) {
    return { success: false, errors };
  }

  const sourceFieldId = trimmed(source.length_based_pricing?.sourceField);
  const discount = source.discount ?? 0;
  const validUntil = trimmed(source.discount_valid_until);

  return {
    success: true,
    definition: {
      id: source.product_id.trim(),
      label: source.title.trim(),
      type: productType.data,
      orderable: source.can_be_ordered ?? false,
      basePrice: source.price ?? 0,
      pricing: sourceFieldId === undefined ? { kind: "unit" } : { kind: "length", sourceFieldId },
      ...(discount > 0 && validUntil !== undefined
        ? { discount: { percent: discount, validUntil } }
        : {}),
      fields,
      forbiddenMaterialCombinations: (source.materials?.banned_combinations ?? []).map(
        (combination) =>
          combination.materials
            ?.filter((member) => member !== null)
            .map((member) => materialSlugFromPath(member.material_path).trim()) ?? []
      ),
    },
  };
}
