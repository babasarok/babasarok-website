import z from "zod";

const materialColorValidator = z.object({
    color_id: z.string(),
    label: z.string(),
    hex: z
        .string()
        .optional()
        .transform((val) => (val === "" ? undefined : val)),
    image: z
        .string()
        .optional()
        .transform((val) => (val === "" ? undefined : val)),
});

export type TinaMaterialColor = z.infer<typeof materialColorValidator>;

export const materialValidator = z.object({
    material_id: z.string(),
    label: z.string(),
    colors: z.array(materialColorValidator).optional(),
});

export type TinaMaterial = z.infer<typeof materialValidator>;
