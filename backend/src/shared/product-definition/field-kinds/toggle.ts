import { z } from "zod";
import { FieldVisibilitySchema, fieldBaseShape } from "../field.ts";
import { MoneySchema } from "../model.ts";

export const ToggleFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("toggle"),
  visibility: FieldVisibilitySchema,
  price: MoneySchema,
});

export type ToggleField = z.output<typeof ToggleFieldSchema>;
