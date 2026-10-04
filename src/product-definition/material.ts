import { z } from "zod";

export const MaterialColorIdSchema = z.string().trim().min(1);
export const MaterialIdSchema = z.string().trim().min(1);

const HexAppearanceSchema = z.object({
  kind: z.literal("hex"),
  value: z.string().regex(/^#[0-9a-f]{6}$/i),
});

const ImageAppearanceSchema = z.object({
  kind: z.literal("image"),
  assetId: z.string().trim().min(1),
});

export const MaterialColorAppearanceSchema = z.discriminatedUnion("kind", [
  HexAppearanceSchema,
  ImageAppearanceSchema,
]);

export const MaterialColorDefinitionSchema = z.object({
  id: MaterialColorIdSchema,
  label: z.string().trim().min(1),
  appearance: MaterialColorAppearanceSchema,
});

export const MaterialDefinitionSchema = z.object({
  id: MaterialIdSchema,
  label: z.string().trim().min(1),
  colors: z.array(MaterialColorDefinitionSchema).min(1),
});

export type MaterialDefinition = z.output<typeof MaterialDefinitionSchema>;
export type MaterialColorDefinition = z.output<typeof MaterialColorDefinitionSchema>;
export type MaterialColorAppearance = z.output<typeof MaterialColorAppearanceSchema>;
export type MaterialColorId = z.output<typeof MaterialColorIdSchema>;
export type MaterialId = z.output<typeof MaterialIdSchema>;
