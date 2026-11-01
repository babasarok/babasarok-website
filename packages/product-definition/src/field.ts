import { z } from "zod";
import { LabelSchema, ProductFieldIdSchema, TrimmedTextSchema } from "./model";

export const FieldVisibilitySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("always") }),
  z.strictObject({
    kind: z.literal("when-present"),
    fieldId: ProductFieldIdSchema,
  }),
  z.strictObject({
    kind: z.literal("when-equal"),
    fieldId: ProductFieldIdSchema,
    value: z.union([z.string().min(1), z.boolean()]),
  }),
]);

export const PatternSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        new RegExp(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid regular expression" }
  );

export const fieldBaseShape = {
  id: ProductFieldIdSchema,
  label: LabelSchema,
  tooltip: TrimmedTextSchema.optional(),
};

export type FieldVisibility = z.output<typeof FieldVisibilitySchema>;
