import { z } from "zod";
import { FieldVisibilitySchema, fieldBaseShape, PatternSchema } from "../field.ts";
import { LocalizedTextSchema } from "../localized-text.ts";
import { MoneySchema, TrimmedTextSchema } from "../model.ts";

export const ChoiceOptionIdSchema = TrimmedTextSchema.brand<"ChoiceOptionId">();

export const ChoiceOptionSchema = z.strictObject({
  id: ChoiceOptionIdSchema,
  label: LocalizedTextSchema,
  price: MoneySchema,
  tooltip: LocalizedTextSchema.optional(),
});

export const ChoiceFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("choice"),
  presentation: z.enum(["select", "radio", "color"]),
  visibility: FieldVisibilitySchema,
  options: z.array(ChoiceOptionSchema).min(1),
  customValue: z
    .strictObject({
      pattern: PatternSchema.optional(),
      placeholder: LocalizedTextSchema.optional(),
    })
    .optional(),
});

export type ChoiceField = z.output<typeof ChoiceFieldSchema>;
export type ChoiceOption = z.output<typeof ChoiceOptionSchema>;
export type ChoiceOptionId = z.output<typeof ChoiceOptionIdSchema>;
