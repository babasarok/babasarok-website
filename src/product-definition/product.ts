import { z } from "zod";
import { PRODUCT_TYPE_VALUES } from "../lib/product/productTypes";
import { ChoiceFieldSchema } from "./field-kinds/choice";
import { MaterialIdSchema } from "./material";
import { EmbroideryFieldSchema } from "./field-kinds/embroidery";
import { InputFieldSchema } from "./field-kinds/input";
import { MaterialFieldSchema } from "./field-kinds/material";
import { ToggleFieldSchema } from "./field-kinds/toggle";
import {
  LabelSchema,
  MoneySchema,
  ProductFieldIdSchema,
  ProductIdSchema,
  ProductRevisionSchema,
} from "./model";

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
  revision: ProductRevisionSchema,
  type: ProductTypeSchema,
  orderable: z.boolean(),
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
