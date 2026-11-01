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
  fields: z.array(ProductFieldSchema),
  forbiddenMaterialCombinations: z.array(ForbiddenMaterialCombinationSchema),
});

export type ProductType = z.output<typeof ProductTypeSchema>;
export type ProductPricing = z.output<typeof ProductPricingSchema>;
export type ProductField = z.output<typeof ProductFieldSchema>;
export type ProductDefinition = z.output<typeof ProductDefinitionSchema>;
export type ProductDefinitionInput = z.input<typeof ProductDefinitionSchema>;
