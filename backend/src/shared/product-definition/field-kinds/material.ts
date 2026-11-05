import { z } from "zod";
import { fieldBaseShape } from "../field.ts";
import { MaterialIdSchema } from "../material.ts";
import { MoneySchema, ProductFieldIdSchema } from "../model.ts";

const MaterialOptionSchema = z.strictObject({
  materialId: MaterialIdSchema,
  price: MoneySchema,
});

const MaterialColorCountSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fixed"), count: z.int().positive() }),
  z.strictObject({ kind: z.literal("from-field"), fieldId: ProductFieldIdSchema }),
]);

export const MaterialFieldSchema = z.strictObject({
  ...fieldBaseShape,
  kind: z.literal("material"),
  options: z.array(MaterialOptionSchema).min(1),
  colorCount: MaterialColorCountSchema,
});

export type MaterialField = z.output<typeof MaterialFieldSchema>;
