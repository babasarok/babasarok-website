import { z } from "zod";
import { LabelSchema, PositiveMoneySchema, ProductIdSchema, TrimmedTextSchema } from "./model";

// Membership lives in native Vendure Collections (a private child of the
// "Szettek" / "Kapcsolódó termékek" parents, members via the product-id
// filter; the set discount is a Collection custom field) — the canonical
// schemas remain the seed's Tina-content validation and the group-shape
// yardstick.
export const ProductGroupIdSchema = TrimmedTextSchema.brand<"ProductGroupId">();

export const DiscountedProductSetSchema = z.strictObject({
  kind: z.literal("discounted-set"),
  id: ProductGroupIdSchema,
  label: LabelSchema,
  discount: PositiveMoneySchema,
  productIds: z.array(ProductIdSchema).min(2),
});

export const RelatedItemsSchema = z.strictObject({
  kind: z.literal("related-items"),
  id: ProductGroupIdSchema,
  label: LabelSchema,
  productIds: z.array(ProductIdSchema).min(2),
});

export const ProductGroupDefinitionSchema = z.discriminatedUnion("kind", [
  DiscountedProductSetSchema,
  RelatedItemsSchema,
]);

export type ProductGroupId = z.output<typeof ProductGroupIdSchema>;
export type DiscountedProductSet = z.output<typeof DiscountedProductSetSchema>;
export type RelatedItems = z.output<typeof RelatedItemsSchema>;
export type ProductGroupDefinition = z.output<typeof ProductGroupDefinitionSchema>;
