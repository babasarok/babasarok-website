import type {
    TinaBaseField,
    TinaBooleanField,
    TinaColorField,
    TinaProductField,
    TinaInputField,
    TinaOption,
    TinaProduct,
    TinaProductMaterial,
    TinaRadioField,
    TinaSelectField,
    TinaProductMaterials,
    TinaProductMaterialBannedCombination,
} from "../../tina/productTypes";
import type { TinaMaterial, TinaMaterialColor } from "../../tina/materialTypes";
import type { TinaDeliveryMethod } from "../../tina/deliveryMethodTypes";

export interface TinaResolvedMaterial extends TinaMaterial {
    colors?: TinaMaterialColor[];
}

export interface TinaResolvedProductMaterial extends TinaProductMaterial {
    material: TinaResolvedMaterial;
}

export interface TinaResolvedProductMaterialBannedCombination extends TinaProductMaterialBannedCombination {
    material_path: string;
    // material: TinaResolvedProductMaterial;
}

export interface TinaResolvedProductBannedCombinationItem {
    materials: TinaResolvedProductMaterialBannedCombination[];
}

export interface TinaResolvedProductMaterials extends TinaProductMaterials {
    materials?: TinaResolvedProductMaterial[] | undefined;
    banned_combinations?: TinaResolvedProductBannedCombinationItem[] | undefined;
}

export type TinaResolvedInputField = TinaInputField & {
    type: "input";
    items: TinaOption[];
};

export type TinaResolvedSelectField = TinaSelectField & {
    type: "select";
    items: TinaOption[];
};

export type TinaResolvedRadioField = TinaRadioField & {
    type: "radio";
    items: TinaOption[];
};

export type TinaResolvedColorField = TinaColorField & {
    type: "color";
    items: TinaOption[];
};

export type TinaResolvedBooleanField = TinaBooleanField & {
    type: "toggle";
};

export type TinaResolvedProductField =
    | TinaResolvedInputField
    | TinaResolvedSelectField
    | TinaResolvedRadioField
    | TinaResolvedColorField
    | TinaResolvedBooleanField;

export type InputField = TinaResolvedInputField & {
    value?: ValueWithError;
};

export type SelectField = TinaResolvedSelectField & {
    value?: ValueWithError;
};

export type RadioField = TinaResolvedRadioField & {
    value?: ValueWithError;
};

export type ColorField = TinaResolvedColorField & {
    value?: ValueWithError;
};

export type BooleanField = TinaResolvedBooleanField & {
    value?: ValueWithError;
};

export type Field = InputField | SelectField | RadioField | ColorField | BooleanField;

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

export interface TinaProductResolved extends TinaProduct {
    materials?: TinaResolvedProductMaterials | undefined;
    fields?: TinaResolvedProductField[];
    product_path: string;
}

export interface TinaDeliveryMethodResolved extends TinaDeliveryMethod {
    delivery_path: string;
}
