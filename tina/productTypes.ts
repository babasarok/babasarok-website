import z from "zod";

const optionValidator = z.object({
    value: z.string(),
    label: z.string().optional(),
    tooltip: z.string().optional(),
    price: z.number().default(0),
});

export type TinaOption = z.infer<typeof optionValidator>;

const baseFieldValidator = z.object({
    name: z.string(),
    label: z.string().optional(),
    length_based_pricing_source: z.boolean().optional(),
    regex: z.string().optional(),
    price: z.number().default(0),
});

export type TinaBaseField = z.infer<typeof baseFieldValidator>;

const inputFieldValidator = baseFieldValidator.extend({
    type: z.literal("input"),
    placeholder: z.string().optional(),
    optional: z.boolean().optional(),
    items: z.array(optionValidator).optional(),
});

export type TinaInputField = z.infer<typeof inputFieldValidator>;

const selectFieldValidator = baseFieldValidator.extend({
    type: z.literal("select"),
    multiple: z.boolean().optional(),
    placeholder: z.string().optional(),
    allow_custom_value: z.boolean().optional(),
    items: z.array(optionValidator).optional(),
});

export type TinaSelectField = z.infer<typeof selectFieldValidator>;

const radioFieldValidator = baseFieldValidator.extend({
    type: z.literal("radio"),
    allow_custom_value: z.boolean().optional(),
    items: z.array(optionValidator).optional(),
});

export type TinaRadioField = z.infer<typeof radioFieldValidator>;

const colorFieldValidator = baseFieldValidator.extend({
    type: z.literal("color"),
    allow_custom_value: z.boolean().optional(),
    items: z.array(optionValidator).optional(),
});

export type TinaColorField = z.infer<typeof colorFieldValidator>;

const booleanFieldValidator = baseFieldValidator.extend({
    type: z.literal("toggle"),
});

export type TinaBooleanField = z.infer<typeof booleanFieldValidator>;

const fieldValidator = z.discriminatedUnion("type", [
    inputFieldValidator,
    selectFieldValidator,
    radioFieldValidator,
    colorFieldValidator,
    booleanFieldValidator,
]);

export type TinaProductField = z.infer<typeof fieldValidator>;

const productMaterialValidator = z.object({
    material_path: z.string(),
    price: z.number().default(0),
    color_count: z.string().optional(),
});

export type TinaProductMaterial = z.infer<typeof productMaterialValidator>;

const productMaterialBannedCombinationValidator = z.object({ material_path: z.string() });

export type TinaProductMaterialBannedCombination = z.infer<typeof productMaterialBannedCombinationValidator>;

const productMaterialsValidator = z.object({
    materials: z.array(productMaterialValidator).optional(),
    material_required_count: z.number().optional(),
    banned_combinations: z
        .array(z.object({ materials: z.array(productMaterialBannedCombinationValidator) }))
        .optional(),
});

export type TinaProductMaterials = z.infer<typeof productMaterialsValidator>;

export const productValidator = z.object({
    product_id: z.string(),
    title: z.string(),
    icon: z.string().optional(),
    priced_by_length: z.boolean().optional(),
    price: z.number().default(0),
    discount: z.number().optional(),
    discount_valid_until: z.coerce.date().optional(),
    fields: z.array(fieldValidator).optional(),
    materials: productMaterialsValidator.optional(),
});

export type TinaProduct = z.infer<typeof productValidator>;
