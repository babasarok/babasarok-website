import { ToggleField, type InputFieldType, type TinaField, type ReferenceField, type ToggleProps, GroupListField, type GroupFieldProps, type GroupProps, TextField, type TextFieldProps, type InputProps, } from "tinacms";

export interface Option {
    value: string;
    label?: string;
    tooltip?: string;
}

export interface BaseField {
    name: string;
    label?: string;
    value?: string;
}

export interface InputField extends BaseField {
    type: "input";
    regex?: string;
    placeholder?: string;
}

export interface SelectField extends BaseField {
    type: "select";
    items: Option[];
    multiple?: boolean;
    placeholder?: string;
}

export interface RadioField extends BaseField {
    type: "radio";
    items: Option[];
}


export type Field = InputField | SelectField | RadioField;

export interface Product {
    product_id: string;
    name: string;
    icon?: string;
    fields: Field[];
}

export const PRODUCT: TinaField<false>[] = [
    {
        type: "string",
        name: "product_id",
        description: "Egyedi! azonosító a termékhez, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: termek-1",
        label: "Termék ID",
    },
    {
        type: "string",
        name: "name",
        description: "A termék megjelenítendő neve, ami a felhasználó számára látható.",
        label: "Termék név",
    },
    {
        type: "image",
        name: "icon",
        description: "NE VÁLTOZTASD MEG, még nem tudtam megoldani hogy ezt lehessen átállítani.Opcionális ikon a termékhez, ami megjelenik a rendelési felületen.",
        label: "Termék ikon",
    },
    {
        type: "object",
        name: "fields",
        list: true,
        label: "Választandó mezők",
        description: "A termékhez tartozó egyedi mezők. A sorrendjük meghatározza a megjelenítésük sorrendjét.",
        ui: {
            itemProps: (item) => {
                return { label: item?.label || "Új mező" };
            },
        },
        fields: [
            {
                type: "string",
                name: "name",
                description: "Egyedi! azonosító a mezőhöz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: meret",
                label: "Mező ID",
                required: true,
            },
            {
                type: "string",
                name: "label",
                description: "A mező megjelenítendő neve, ami a felhasználó számára látható.",
                label: "Mező név",
                isTitle: true,
                required: true,
            },
            {
                type: "string",
                name: "type",
                description: "A mező típusa, ami meghatározza, hogy az adatokat milyen formában kell megadni.",
                required: true,
                options: [
                    { value: "input", label: "Szöveg" },
                    { value: "select", label: "Legördülő" },
                    { value: "radio", label: "Gombos - egyválasztós" },
                ],
                label: "Mező típus",
            },
            {
                type: "object",
                list: true,
                name: "items",
                label: "Választási lehetőségek",
                description: "A mezőhöz tartozó választható lehetőségek.",
                ui: {
                    itemProps: (item) => {
                        return { label: item?.name || item?.value || "Új mező" };
                    },
                    component(props) {
                        const castedProps = props as unknown as InputFieldType<GroupProps, Parameters<typeof ReferenceField>[0]>;
                        const typeValue = props.field.name.split(".").slice(0, -1).reduce((obj, key) => obj && obj[key], castedProps.form.getState().values).type;
                        if (typeValue != "select" && typeValue != "radio") {
                            return null;
                        }

                        return GroupListField(castedProps);
                    },
                },
                fields: [
                    {
                        type: "string",
                        name: "value",
                        label: "Érték",
                        required: true,
                        description: "A lehetőség értéke, amit a rendszer használ.",
                    },
                    {
                        type: "string",
                        name: "name",
                        label: "Címke",
                        description: "A lehetőség megjelenítendő neve, ami a felhasználó számára látható. Ha nincs megadva, akkor a value értékét használja.",
                    },
                    {
                        type: "string",
                        name: "tooltip",
                        label: "Tooltip",
                        description: "Opcionális leírás, ami megjelenik, amikor a felhasználó a lehetőség fölé viszi az egeret.",
                    }
                ],
            },
            {
                type: "boolean",
                name: "multiple",
                label: "Több érték engedélyezése",
                description: "Jelzi, hogy a mező több értéket is engedélyez-e.",
                ui: {
                    component(props) {
                        const castedProps = props as unknown as InputFieldType<ToggleProps, Parameters<typeof ReferenceField>[0]>;
                        const typeValue = props.field.name.split(".").slice(0, -1).reduce((obj, key) => obj && obj[key], castedProps.form.getState().values).type;
                        if (typeValue != "select") {
                            return null;
                        }

                        return ToggleField(castedProps);
                    },
                }
            },
            {
                type: "string",
                name: "placeholder",
                label: "Placeholder",
                description: "A mező helykitöltő szövege, ami megjelenik, amikor nincs kiválasztott érték.",
                ui: {
                    component(props) {
                        const castedProps = props as unknown as InputFieldType<InputProps, Parameters<typeof ReferenceField>[0]>;
                        const typeValue = props.field.name.split(".").slice(0, -1).reduce((obj, key) => obj && obj[key], castedProps.form.getState().values).type;
                        if (typeValue != "select" && typeValue != "input") {
                            return null;
                        }

                        return TextField(castedProps as any);
                    },
                }
            },

        ],
    },
];
