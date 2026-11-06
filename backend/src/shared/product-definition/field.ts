import { z } from "zod";
import { LocalizedTextSchema } from "./localized-text";
import { ProductFieldIdSchema } from "./model";

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
    { message: "Nem érvényes reguláris kifejezés" }
  );

export const fieldBaseShape = {
  id: ProductFieldIdSchema,
  label: LocalizedTextSchema,
  tooltip: LocalizedTextSchema.optional(),
};

export type FieldVisibility = z.output<typeof FieldVisibilitySchema>;
