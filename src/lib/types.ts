import type { BaseField, Field, Option, Product, ProductMaterial } from "../../tina/productTypes";
import type { Material, MaterialColor } from "../../tina/materialTypes";

export interface ResolvedMaterial extends Material {
    colors?: MaterialColor[];
}

export interface ProductMaterialResolved extends ProductMaterial {
    material: ResolvedMaterial;
}

export type InputFieldResolved = BaseField & {
    type: "input";
    items: Option[];
};

export type SelectFieldResolved = BaseField & {
    type: "select";
    items: Option[];
};

export type RadioFieldResolved = BaseField & {
    type: "radio";
    items: Option[];
};

export type ColorFieldResolved = BaseField & {
    type: "color";
    items: Option[];
};

export type BooleanFieldResolved = BaseField & {
    type: "toggle";
};

export type FieldResolved = InputFieldResolved | SelectFieldResolved | RadioFieldResolved | ColorFieldResolved | BooleanFieldResolved;

export type FieldInternal = FieldResolved & {
    value?: ValueWithError;
};

export interface ValueWithError {
    value: string;
    is_custom?: boolean;
    error?: string | undefined;
}

export interface ProductMaterialValue {
    material_id: string;
    colors: string[];
    custom_color?: string | undefined;
    error?: string | undefined;
}

export interface ProductResolved extends Product {
    materials?: ProductMaterialResolved[];
    fields?: FieldResolved[];
}

export interface ProductItem extends ProductResolved {
    uuid: string;
    count: number;
    material_values?: ProductMaterialValue[]
    fields?: FieldInternal[];
}

export function nonEmptyObject<T extends Record<string, any>>(obj: T): obj is Exclude<T, Record<string, never>> {
    return Object.keys(obj).length > 0;
}
