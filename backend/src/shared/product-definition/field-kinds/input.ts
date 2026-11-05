import { z } from "zod";
import { FieldVisibilitySchema, fieldBaseShape, PatternSchema } from "../field.ts";
import { LocalizedTextSchema } from "../localized-text.ts";
import { MoneySchema, TrimmedTextSchema } from "../model.ts";

const SuggestionSchema = z.strictObject({
  value: TrimmedTextSchema,
  label: LocalizedTextSchema,
});

export const InputFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("input"),
  visibility: FieldVisibilitySchema,
  required: z.boolean(),
  price: MoneySchema,
  placeholder: LocalizedTextSchema.optional(),
  pattern: PatternSchema.optional(),
  suggestions: z.array(SuggestionSchema).min(1).optional(),
});

export type InputField = z.output<typeof InputFieldSchema>;
