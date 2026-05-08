import {
    ToggleField,
    type InputFieldType,
    type TinaField,
    type ReferenceField,
    type ToggleProps,
    GroupListField,
    type GroupFieldProps,
    type GroupProps,
    TextField,
    type TextFieldProps,
    type InputProps,
    NumberField,
    type NumberProps,
    ButtonToggleField,
    type ButtonToggleProps
} from "tinacms";

export interface Option {
    value: string;
    label?: string;
    tooltip?: string;
    price?: number;
    fixed_price?: boolean;
}

export interface BaseField {
    name: string;
    label?: string;
    /**
     * Csak belső használatra, nem jelenik meg a felhasználó számára.
     */
    value?: {
        value: string;
        is_custom?: boolean;
        error?: string | undefined;
    };
    length_based_pricing_source?: boolean;
    regex?: string;
    price?: number;
}

export interface InputField extends BaseField {
    type: "input";
    placeholder?: string;
    items?: Option[];
}

export interface SelectField extends BaseField {
    type: "select";
    items: Option[];
    multiple?: boolean;
    placeholder?: string;
    allow_custom_value?: boolean;
}

export interface RadioField extends BaseField {
    type: "radio";
    items: Option[];
    allow_custom_value?: boolean;
}

export interface ColorField extends BaseField {
    type: "color";
    items: Option[];
    allow_custom_value?: boolean;
}

export interface BooleanField extends BaseField {
    type: "toggle";
}

export type Field = InputField | SelectField | RadioField | ColorField | BooleanField;

export interface ProductMaterial {
    material: string;
    price?: number;
    color_count?: string;
}

export interface Product {
    product_id: string;
    name: string;
    icon?: string;
    priced_by_length?: boolean;
    price?: number;
    fields: Field[];
    materials?: ProductMaterial[];
    material_value?: {
        material_id: string;
        colors: string[]
    }
}

export interface ProductItem extends Product {
    uuid: string;
    count: number;
}

const priceField: TinaField = {
    type: "number",
    name: "price",
    label: "Ár",
    description: "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni.",
    ui: {
        component(props) {
            const castedProps = props as unknown as InputFieldType<NumberProps, Parameters<typeof ReferenceField>[0]>;
            const value = props.field.name.split(".").slice(0, -3).reduce((obj, key) => obj && obj[key], castedProps.form.getState().values).length_based_pricing_source;
            if (value) {
                return null;
            }

            return NumberField(castedProps as any);
        },
        parse(value) {
            if (typeof value === "string") {
                const parsed = Number.parseFloat(value);
                return Number.isNaN(parsed) ? 0 : parsed;
            }

            return value;
        }

    }
};

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
        type: "boolean",
        name: "priced_by_length",
        label: "Méteráru",
        description: "Jelzi, hogy a termék ára a hossz alapján kerül meghatározásra, nem pedig fix ár alapján. Egy mezőnek méretnek kell lennie",
    },
    {
        type: "number",
        name: "price",
        label: "Alap Ár - Forintban",
    },
    {
        type: "object",
        name: "materials",
        list: true,
        label: "Anyagok",
        description: "A termékhez tartozó anyagok. Ha nincs egy se hozzáadva, akkor a termékhez nem lesz anyag kiválasztási lehetőség a rendelési felületen.",
        ui: {
            itemProps: (item) => {
                return { label: item?.material || "Új anyag" };
            },
        },
        fields: [
            {
                type: "reference",
                name: "material",
                label: "Anyag",
                description: "Válassz egy anyagot a listából.",
                collections: ["product_materials"],
            },
            priceField,
            {
                type: "string",
                name: "color_count",
                label: "Választható színek/minták száma",
                description: "Az alap 1. Ha egy másik mező az alapja, írd be a Mező ID-jét. A Mezó szám alapú legyen.",
            }
        ],
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
                type: "boolean",
                name: "length_based_pricing_source",
                description: "Jelzi, hogy ez a mező szolgáltatja-e a méterárú számolás alapját. CM-ben kötelező megadni az értékeket! Csak egy mező jelölhető meg méterárú árforrásként.",
                label: "Méteráru árforrás",
            },
            priceField,
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
                    { value: "color", label: "Szín" },
                    { value: "toggle", label: "Igen/Nem" },
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
                        return { label: item?.label || item?.value || "Új mező" };
                    },
                    component(props) {
                        const castedProps = props as unknown as InputFieldType<GroupFieldProps, Parameters<typeof ReferenceField>[0]>;
                        const value = props.field.name.split(".").slice(0, -1).reduce((obj, key) => obj && obj[key], castedProps.form.getState().values).type;
                        if (value === "toggle") {
                            return null;
                        }

                        return GroupListField(castedProps as any);
                    },
                },
                fields: [
                    {
                        type: "string",
                        name: "value",
                        label: "Érték",
                        required: true,
                        description: "Az opció értéke, amit a rendszer használ.",
                    },
                    {
                        type: "string",
                        name: "label",
                        label: "Címke",
                        description: "Az opció megjelenítendő neve, ami a felhasználó számára látható. Ha nincs megadva, akkor a value értékét használja.",
                    },
                    {
                        type: "boolean",
                        name: "fixed_price",
                        label: "Fix ár",
                        description: "Méterárunál ez az opció fix árnak lesz tekintve.",
                        ui: {
                            component(props) {
                                const castedProps = props as unknown as InputFieldType<ToggleProps, Parameters<typeof ReferenceField>[0]>;
                                const value = props.field.name.split(".").slice(0, -3).reduce((obj, key) => obj && obj[key], castedProps.form.getState().values).length_based_pricing_source;
                                if (!value) {
                                    return null;
                                }

                                return ToggleField(castedProps as any);
                            },
                        }
                    },
                    {
                        type: "number",
                        name: "price",
                        label: "Ár",
                        description: "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni.",
                        ui: {
                            component(props) {
                                const castedProps = props as unknown as InputFieldType<NumberProps, Parameters<typeof ReferenceField>[0]>;
                                const values = castedProps.form.getState().values;
                                const length_based_pricing_source = props.field.name.split(".").slice(0, -3).reduce((obj, key) => obj && obj[key], values).length_based_pricing_source;
                                const fixed_price = props.field.name.split(".").slice(0, -1).reduce((obj, key) => obj && obj[key], values).fixed_price;
                                if (length_based_pricing_source && !fixed_price) {
                                    return null;
                                }

                                return NumberField(castedProps as any);
                            },
                        }
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
                name: "allow_custom_value",
                description: "Ha engedélyezve van, a felhasználó egyedi értéket is megadhat a mezőhöz.",
                label: "Egyedi érték engedélyezése",
                ui: {
                    component(props) {
                        const castedProps = props as unknown as InputFieldType<ToggleProps, Parameters<typeof ReferenceField>[0]>;
                        const typeValue = props.field.name.split(".").slice(0, -1).reduce((obj, key) => obj && obj[key], castedProps.form.getState().values).type;
                        if (typeValue != "select" && typeValue != "radio" && typeValue != "color") {
                            return null;
                        }

                        return ToggleField(castedProps);
                    },
                }
            },
            {
                type: "string",
                name: "regex",
                description: "Opcionális reguláris kifejezés, aminek a mező értékének meg kell felelnie.",
                label: "Érvényességi minta (regex)",
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
                        if (typeValue === "select" || typeValue === "radio") {
                            return null;
                        }

                        return TextField(castedProps as any);
                    },
                }
            },

        ],
    },
];
