import { z } from "zod";
import { FieldVisibilitySchema, fieldBaseShape, PatternSchema } from "../field.ts";
import { LocalizedTextSchema } from "../localized-text.ts";
import { MoneySchema } from "../model.ts";

const EmbroideryPricingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("flat"), price: MoneySchema }),
  z.strictObject({ kind: z.literal("per-word"), pricePerWord: MoneySchema }),
]);

export const EmbroideryFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("embroidery"),
  visibility: FieldVisibilitySchema,
  pricing: EmbroideryPricingSchema,
  placeholder: LocalizedTextSchema.optional(),
  pattern: PatternSchema.optional(),
});

export type EmbroideryField = z.output<typeof EmbroideryFieldSchema>;
