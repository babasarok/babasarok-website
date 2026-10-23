import { z } from "zod";
import { LabelSchema, TrimmedTextSchema } from "./model";

export const MaterialIdSchema = TrimmedTextSchema.brand<"MaterialId">();
export const MaterialColorIdSchema = TrimmedTextSchema.brand<"MaterialColorId">();

const HexAppearanceSchema = z.strictObject({
  kind: z.literal("hex"),
  value: z.string().regex(/^#[0-9a-f]{6}$/i),
});

const ImageAppearanceSchema = z.strictObject({
  kind: z.literal("image"),
  assetId: TrimmedTextSchema,
});

export const ColorAppearanceSchema = z.discriminatedUnion("kind", [
  HexAppearanceSchema,
  ImageAppearanceSchema,
]);

export const MaterialColorDefinitionSchema = z.strictObject({
  id: MaterialColorIdSchema,
  label: LabelSchema,
  appearance: ColorAppearanceSchema,
});

export const MaterialDefinitionSchema = z.strictObject({
  id: MaterialIdSchema,
  label: LabelSchema,
  colors: z.array(MaterialColorDefinitionSchema).min(1),
});

export type MaterialDefinition = z.output<typeof MaterialDefinitionSchema>;
export type MaterialColorDefinition = z.output<typeof MaterialColorDefinitionSchema>;
export type ColorAppearance = z.output<typeof ColorAppearanceSchema>;
export type MaterialColorId = z.output<typeof MaterialColorIdSchema>;
export type MaterialId = z.output<typeof MaterialIdSchema>;
