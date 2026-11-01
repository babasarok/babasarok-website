import { z } from "zod";
import { FieldVisibilitySchema, fieldBaseShape, PatternSchema } from "../field";
import { MoneySchema, TrimmedTextSchema } from "../model";

const EmbroideryPricingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("flat"), price: MoneySchema }),
  z.strictObject({ kind: z.literal("per-word"), pricePerWord: MoneySchema }),
]);

export const EmbroideryFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("embroidery"),
  visibility: FieldVisibilitySchema,
  pricing: EmbroideryPricingSchema,
  placeholder: TrimmedTextSchema.optional(),
  pattern: PatternSchema.optional(),
});

export type EmbroideryField = z.output<typeof EmbroideryFieldSchema>;
