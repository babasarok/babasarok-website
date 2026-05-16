import z from "zod";

const emptyObject = z.object({});

const optionValidator = z.object({
    value: z.string(),
    label: z.string().optional(),
    tooltip: z.string().optional(),
    price: z.number().optional(),
    fixed_price: z.boolean().optional(),
});

export type Option = z.infer<typeof optionValidator>;

const baseFieldValidator = z.object({
    name: z.string(),
    label: z.string().optional(),
    length_based_pricing_source: z.boolean().optional(),
    regex: z.string().optional(),
    price: z.number().optional(),
});

export type BaseField = z.infer<typeof baseFieldValidator>;

const inputFieldValidator = baseFieldValidator.extend({
    type: z.literal("input"),
    placeholder: z.string().optional(),
    items: z.array(optionValidator.or(emptyObject)).optional(),
});

export type InputField = z.infer<typeof inputFieldValidator>;

const selectFieldValidator = baseFieldValidator.extend({
    type: z.literal("select"),
    multiple: z.boolean().optional(),
    placeholder: z.string().optional(),
    allow_custom_value: z.boolean().optional(),
    items: z.array(optionValidator.or(emptyObject)).optional(),
});

export type SelectField = z.infer<typeof selectFieldValidator>;

const radioFieldValidator = baseFieldValidator.extend({
    type: z.literal("radio"),
    allow_custom_value: z.boolean().optional(),
    items: z.array(optionValidator.or(emptyObject)).optional(),
});

export type RadioField = z.infer<typeof radioFieldValidator>;

const colorFieldValidator = baseFieldValidator.extend({
    type: z.literal("color"),
    allow_custom_value: z.boolean().optional(),
    items: z.array(optionValidator.or(emptyObject)).optional(),
});

export type ColorField = z.infer<typeof colorFieldValidator>;

const booleanFieldValidator = baseFieldValidator.extend({
    type: z.literal("toggle"),
});

export type BooleanField = z.infer<typeof booleanFieldValidator>;

const fieldValidator = z.discriminatedUnion("type", [
    inputFieldValidator,
    selectFieldValidator,
    radioFieldValidator,
    colorFieldValidator,
    booleanFieldValidator,
]);

export type Field = z.infer<typeof fieldValidator>;


const productMaterialValidator = z.object({
    material_path: z.string(),
    price: z.number().optional(),
    color_count: z.string().optional(),
});

export type ProductMaterial = z.infer<typeof productMaterialValidator>;

// export interface ProductTieIn {
//     product_id: string;
// }


export const productValidator = z.object({
    product_id: z.string(),
    name: z.string(),
    icon: z.string().optional(),
    priced_by_length: z.boolean().optional(),
    price: z.number().optional(),
    fields: z.array(fieldValidator.or(emptyObject)).optional(),
    materials: z.array(productMaterialValidator.or(emptyObject)).optional(),
    // tie_ins: z.array(z.object({
    //     product_id: z.string(),
    // })).optional(),
    material_required_count: z.number().optional(),
});

export type Product = z.infer<typeof productValidator>;
