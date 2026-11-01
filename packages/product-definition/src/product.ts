import { createHash } from "node:crypto";
import { z } from "zod";
import { ChoiceFieldSchema } from "./field-kinds/choice";
import { EmbroideryFieldSchema } from "./field-kinds/embroidery";
import { InputFieldSchema } from "./field-kinds/input";
import { MaterialFieldSchema } from "./field-kinds/material";
import { MaterialIdSchema } from "./material";
import { ToggleFieldSchema } from "./field-kinds/toggle";
import {
  LabelSchema,
  MoneySchema,
  ProductFieldIdSchema,
  ProductIdSchema,
  ProductRevisionSchema,
  type ProductRevision,
} from "./model";

// ponytail: duplicates the site's src/lib/product/productTypes.ts values; the
// site keeps its own copy (with labels) until the cutover flips it to this
// package, and this list dies then.
export const PRODUCT_TYPE_VALUES = [
  "racsvedo",
  "takaro",
  "lepedo",
  "parna",
  "babafeszek",
  "zsak",
  "kiegeszito",
] as const;

export const ProductTypeSchema = z.enum(PRODUCT_TYPE_VALUES);

export const ProductPricingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unit") }),
  z.strictObject({ kind: z.literal("length"), sourceFieldId: ProductFieldIdSchema }),
]);

export const ProductDiscountSchema = z.strictObject({
  percent: z.int().min(1).max(99),
  validUntil: z.iso.datetime({ offset: true }),
});

export const ForbiddenMaterialCombinationSchema = z.array(MaterialIdSchema).min(2);

export const ProductFieldSchema = z.discriminatedUnion("kind", [
  InputFieldSchema,
  ChoiceFieldSchema,
  ToggleFieldSchema,
  MaterialFieldSchema,
  EmbroideryFieldSchema,
]);

export const ProductDefinitionSchema = z.strictObject({
  id: ProductIdSchema,
  label: LabelSchema,
  revision: ProductRevisionSchema.optional(),
  type: ProductTypeSchema,
  orderable: z.boolean(),
  // Storefront listing maps this at cutover; it is deliberately not Vendure's
  // native product visibility.
  hiddenInProductList: z.boolean().optional(),
  basePrice: MoneySchema,
  pricing: ProductPricingSchema,
  discount: ProductDiscountSchema.optional(),
  fields: z.array(ProductFieldSchema),
  forbiddenMaterialCombinations: z.array(ForbiddenMaterialCombinationSchema),
});

export type ProductType = z.output<typeof ProductTypeSchema>;
export type ProductPricing = z.output<typeof ProductPricingSchema>;
export type ProductDiscount = z.output<typeof ProductDiscountSchema>;
export type ProductField = z.output<typeof ProductFieldSchema>;
export type ProductDefinition = z.output<typeof ProductDefinitionSchema>;
export type ProductDefinitionInput = z.input<typeof ProductDefinitionSchema>;

/** JSON with recursively sorted object keys, so hashes never depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b));

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }

  if (value === undefined) {
    return "null";
  }

  return JSON.stringify(value);
}

/**
 * The deterministic definition revision: a sha256 over the canonical
 * definition's commerce-relevant facts (the `revision` field itself is
 * stripped first, so the hash never depends on its value). The server sets it
 * on every save; the seed and the dashboard import the same function instead
 * of carrying copies.
 *
 * ponytail: pulls in node:crypto, so this stays a Node-side concern — the
 * Astro site keeps reading products via the API until cutover.
 */
export function productRevision(
  definition: ProductDefinitionInput | ProductDefinition
): ProductRevision {
  const { revision: _ignored, ...facts } = definition;

  return ProductRevisionSchema.parse(
    createHash("sha256").update(canonicalJson(facts)).digest("hex")
  );
}
