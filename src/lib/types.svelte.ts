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
} from "../../tina/productTypes";
import type { TinaMaterial, TinaMaterialColor } from "../../tina/materialTypes";
import { v4 } from "uuid";

export interface TinaResolvedMaterial extends TinaMaterial {
    colors?: TinaMaterialColor[];
}

export interface TinaResolvedProductMaterial extends TinaProductMaterial {
    material: TinaResolvedMaterial;
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
    materials?: TinaResolvedProductMaterial[];
    fields?: TinaResolvedProductField[];
}
