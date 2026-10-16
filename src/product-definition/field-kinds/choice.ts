import { z } from "zod";
import { FieldVisibilitySchema, fieldBaseShape, PatternSchema } from "../field";
import { LabelSchema, MoneySchema, TrimmedTextSchema } from "../model";

export const ChoiceOptionIdSchema = TrimmedTextSchema.brand<"ChoiceOptionId">();

export const ChoiceOptionSchema = z.strictObject({
  id: ChoiceOptionIdSchema,
  label: LabelSchema,
  price: MoneySchema,
  tooltip: TrimmedTextSchema.optional(),
});

export const ChoiceFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("choice"),
  presentation: z.enum(["select", "radio", "color"]),
  price: MoneySchema,
  visibility: FieldVisibilitySchema,
  options: z.array(ChoiceOptionSchema).min(1),
  customValue: z
    .strictObject({
      pattern: PatternSchema.optional(),
      placeholder: TrimmedTextSchema.optional(),
    })
    .optional(),
});

export type ChoiceField = z.output<typeof ChoiceFieldSchema>;
export type ChoiceOption = z.output<typeof ChoiceOptionSchema>;
export type ChoiceOptionId = z.output<typeof ChoiceOptionIdSchema>;
