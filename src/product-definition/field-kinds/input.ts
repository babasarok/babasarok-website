import { z } from "zod";
import { FieldVisibilitySchema, fieldBaseShape, PatternSchema } from "../field";
import { LabelSchema, MoneySchema, TrimmedTextSchema } from "../model";

const SuggestionSchema = z.strictObject({
  value: TrimmedTextSchema,
  label: LabelSchema,
});

export const InputFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("input"),
  visibility: FieldVisibilitySchema,
  required: z.boolean(),
  price: MoneySchema,
  placeholder: TrimmedTextSchema.optional(),
  pattern: PatternSchema.optional(),
  suggestions: z.array(SuggestionSchema).min(1).optional(),
});

export type InputField = z.output<typeof InputFieldSchema>;
