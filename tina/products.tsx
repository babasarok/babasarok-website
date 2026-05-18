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
    type ButtonToggleProps,
} from "tinacms";
import { getValue } from "./utils";

export const PRODUCT: TinaField<false>[] = [
    {
        type: "string",
        name: "product_id",
        description:
            "Egyedi! azonosító a termékhez, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: termek-1",
        label: "Termék ID",
        required: true,
    },
    {
        type: "string",
        name: "name",
        description: "A termék megjelenítendő neve, ami a felhasználó számára látható.",
        label: "Termék név",
        required: true,
    },
    {
        type: "image",
        name: "icon",
        description:
            "NE VÁLTOZTASD MEG, még nem tudtam megoldani hogy ezt lehessen átállítani.Opcionális ikon a termékhez, ami megjelenik a rendelési felületen.",
        label: "Termék ikon",
    },
    {
        type: "boolean",
        name: "priced_by_length",
        label: "Méteráru",
        description:
            "Jelzi, hogy a termék ára a hossz alapján kerül meghatározásra, nem pedig fix ár alapján. Egy mezőnek méretnek kell lennie",
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
        description:
            "A termékhez tartozó anyagok. Ha nincs egy se hozzáadva, akkor a termékhez nem lesz anyag kiválasztási lehetőség a rendelési felületen.",
        ui: {
            itemProps: (item) => {
                return { label: item?.material_path || "Új anyag" };
            },
        },
        fields: [
            {
                type: "reference",
                name: "material_path",
                label: "Anyag",
                description: "Válassz egy anyagot a listából.",
                collections: ["product_materials"],
                required: true,
            },
            {
                type: "number",
                name: "price",
                label: "Ár",
                description: "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni.",
            },
            {
                type: "string",
                name: "color_count",
                label: "Választható színek/minták száma",
                description: "Az alap 1. Ha egy másik mező az alapja, írd be a Mező ID-jét. A Mezó szám alapú legyen.",
            },
        ],
    },
    {
        type: "number",
        name: "material_required_count",
        label: "Szükséges anyagok száma",
        description:
            "Ennek a terméknek a rendeléséhez hány anyagra van szükség. Ez csak akkor lesz releváns, ha anyagokat adtál hozzá a termékhez. Az alap 1.",
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
                description:
                    "Egyedi! azonosító a mezőhöz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: meret",
                label: "Mező ID",
                required: true,
            },
            {
                type: "boolean",
                name: "length_based_pricing_source",
                description:
                    "Jelzi, hogy ez a mező szolgáltatja-e a méterárú számolás alapját. CM-ben kötelező megadni az értékeket! Csak egy mező jelölhető meg méterárú árforrásként.",
                label: "Méteráru árforrás",
            },
            {
                type: "number",
                name: "price",
                label: "Ár",
                description: "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni.",
                ui: {
                    component(props) {
                        const castedProps = props as unknown as InputFieldType<
                            NumberProps,
                            Parameters<typeof ReferenceField>[0]
                        >;
                        const length_based_pricing_source = getValue(props, "length_based_pricing_source");
                        if (length_based_pricing_source) {
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
                    },
                },
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
                    { value: "color", label: "Szín" },
                    { value: "toggle", label: "Igen/Nem" },
                ],
                label: "Mező típus",
            },
            {
                type: "boolean",
                name: "optional",
                description: "Jelzi, hogy a mező opcionális-e.",
                label: "Opcionális mező",
                ui: {
                    component(props) {
                        const typeValue = getValue(props, "type");
                        if (typeValue !== "input") {
                            return null;
                        }

                        return ToggleField(props as any);
                    },
                },
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
                        const type = getValue(props, "type");
                        if (type === "toggle") {
                            return null;
                        }

                        return GroupListField(props as any);
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
                        description:
                            "Az opció megjelenítendő neve, ami a felhasználó számára látható. Ha nincs megadva, akkor a value értékét használja.",
                    },
                    {
                        type: "boolean",
                        name: "fixed_price",
                        label: "Fix ár",
                        description: "Méterárunál ez az opció fix árnak lesz tekintve.",
                        ui: {
                            // component(props) {
                            //     const length_based_pricing_source = getValue(props, "../../length_based_pricing_source");
                            //     if (!length_based_pricing_source) {
                            //         return null;
                            //     }

                            //     return ToggleField(props as any);
                            // }
                            component: "hidden",
                        },
                    },
                    {
                        type: "number",
                        name: "price",
                        label: "Ár",
                        description:
                            "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni.",
                        ui: {
                            component(props) {
                                const length_based_pricing_source = getValue(
                                    props,
                                    "../../length_based_pricing_source"
                                );
                                const fixed_price = getValue(props, "fixed_price");
                                if (length_based_pricing_source && !fixed_price) {
                                    return null;
                                }

                                return NumberField(props as any);
                            },
                            parse(value) {
                                if (typeof value === "string") {
                                    const parsed = Number.parseFloat(value);
                                    return Number.isNaN(parsed) ? 0 : parsed;
                                }

                                return value;
                            },
                        },
                    },
                    {
                        type: "string",
                        name: "tooltip",
                        label: "Tooltip",
                        description:
                            "Opcionális leírás, ami megjelenik, amikor a felhasználó a lehetőség fölé viszi az egeret.",
                    },
                ],
            },
            {
                type: "boolean",
                name: "allow_custom_value",
                description: "Ha engedélyezve van, a felhasználó egyedi értéket is megadhat a mezőhöz.",
                label: "Egyedi érték engedélyezése",
                ui: {
                    component(props) {
                        const typeValue = getValue(props, "type");
                        if (typeValue != "select" && typeValue != "radio" && typeValue != "color") {
                            return null;
                        }

                        return ToggleField(props as any);
                    },
                },
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
                        const typeValue = getValue(props, "type");
                        if (typeValue != "select") {
                            return null;
                        }

                        return ToggleField(props as any);
                    },
                },
            },
            {
                type: "string",
                name: "placeholder",
                label: "Placeholder",
                description: "A mező helykitöltő szövege, ami megjelenik, amikor nincs kiválasztott érték.",
                ui: {
                    component(props) {
                        const typeValue = getValue(props, "type");
                        if (typeValue === "select" || typeValue === "radio") {
                            return null;
                        }

                        return TextField(props as any);
                    },
                },
            },
        ],
    },
];
