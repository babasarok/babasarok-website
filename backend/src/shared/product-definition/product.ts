import { z } from "zod";
import { ChoiceFieldSchema } from "./field-kinds/choice";
import { EmbroideryFieldSchema } from "./field-kinds/embroidery";
import { InputFieldSchema } from "./field-kinds/input";
import { MaterialFieldSchema } from "./field-kinds/material";
import { MaterialIdSchema } from "./material";
import { ToggleFieldSchema } from "./field-kinds/toggle";
import { MoneySchema, ProductFieldIdSchema, ProductIdSchema, ProductRevisionSchema } from "./model";

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
  // Orderability is the native product's "enabled" switch: the shop API only
  // serves enabled products, so a disabled product is neither shown nor
  // orderable (owner decision 2026-11: one switch governs both).
  basePrice: MoneySchema,
  pricing: ProductPricingSchema,
  fields: z.array(ProductFieldSchema),
  forbiddenMaterialCombinations: z.array(ForbiddenMaterialCombinationSchema),
});

export type ProductPricing = z.output<typeof ProductPricingSchema>;
export type ProductField = z.output<typeof ProductFieldSchema>;
export type ProductDefinition = z.output<typeof ProductDefinitionSchema>;
export type ProductDefinitionInput = z.input<typeof ProductDefinitionSchema>;
