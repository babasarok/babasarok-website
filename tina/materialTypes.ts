import z from "zod";

const materialColorValidator = z.object({
    color_id: z.string(),
    label: z.string(),
    hex: z.string().optional(),
});

export type MaterialColor = z.infer<typeof materialColorValidator>;


export const materialValidator = z.object({
    material_id: z.string(),
    label: z.string(),
    colors: z.array(materialColorValidator.or(z.object({}))).optional(),
});

export type Material = z.infer<typeof materialValidator>;
