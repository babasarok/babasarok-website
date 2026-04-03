import type { TinaField } from "tinacms";

export interface Option {
    value: string;
    label?: string;
    tooltip?: string;
}

export interface BaseField {
    name: string;
    order?: number;
    value?: string;
}

export interface InputField extends BaseField {
    type: "input";
    regex?: string;
}

export interface SelectField extends BaseField {
    type: "select";
    items: Option[];
}

export interface RadioField extends BaseField {
    type: "radio";
    items: Option[];
}


export type Field = InputField | SelectField | RadioField;

export interface Product {
    id: string;
    name: string;
    fields: Record<string, Field>;
}

export const PRODUCT: TinaField<false>[] = [
    {
        type: "string",
        name: "id",
        label: "Termék ID",
    }
];
