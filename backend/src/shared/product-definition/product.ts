import { z } from "zod";
import { ChoiceFieldSchema } from "./field-kinds/choice.ts";
import { EmbroideryFieldSchema } from "./field-kinds/embroidery.ts";
import { InputFieldSchema } from "./field-kinds/input.ts";
import { MaterialFieldSchema } from "./field-kinds/material.ts";
import { MaterialIdSchema } from "./material.ts";
import { ToggleFieldSchema } from "./field-kinds/toggle.ts";
import {
  MoneySchema,
  ProductFieldIdSchema,
  ProductIdSchema,
  ProductRevisionSchema,
} from "./model.ts";

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

// The product's name, slug and type live on the native Vendure Product (ADR
// 0011 decisions 1 and 2), not here; `id` stays the immutable business key.
export const ProductDefinitionSchema = z.strictObject({
  id: ProductIdSchema,
  revision: ProductRevisionSchema.optional(),
  orderable: z.boolean(),
  // Storefront listing maps this at cutover; it is deliberately not Vendure's
  // native product visibility.
  hiddenInProductList: z.boolean().optional(),
  basePrice: MoneySchema,
  pricing: ProductPricingSchema,
  fields: z.array(ProductFieldSchema),
  forbiddenMaterialCombinations: z.array(ForbiddenMaterialCombinationSchema),
});

export type ProductPricing = z.output<typeof ProductPricingSchema>;
export type ProductField = z.output<typeof ProductFieldSchema>;
export type ProductDefinition = z.output<typeof ProductDefinitionSchema>;
export type ProductDefinitionInput = z.input<typeof ProductDefinitionSchema>;
