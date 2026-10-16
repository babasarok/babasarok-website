import { z } from "zod";
import { LabelSchema, TrimmedTextSchema } from "./model";
import { ColorAppearanceSchema } from "./material";

export const ThreadColorIdSchema = TrimmedTextSchema.brand<"ThreadColorId">();

export const ThreadColorDefinitionSchema = z.strictObject({
  id: ThreadColorIdSchema,
  label: LabelSchema,
  appearance: ColorAppearanceSchema,
});

export const ThreadColorPaletteSchema = z.array(ThreadColorDefinitionSchema).min(1);

export type ThreadColorId = z.output<typeof ThreadColorIdSchema>;
export type ThreadColorDefinition = z.output<typeof ThreadColorDefinitionSchema>;
export type ThreadColorPalette = z.output<typeof ThreadColorPaletteSchema>;
