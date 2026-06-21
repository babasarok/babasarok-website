import {
    ToggleField,
    type InputFieldType,
    type TinaField,
    type ReferenceField,
    GroupListField,
    TextField,
    NumberField,
    type NumberProps,
    DateField,
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
        name: "title",
        label: "Név",
        required: true,
    },
    {
        type: "boolean",
        name: "hidden_in_product_list",
        label: "Elrejtés",
        description: "Ha be van kapcsolva, ez a termék nem fog megjelenni a termékek listájában a 'Termékek' között.",
    },
    {
        type: "boolean",
        name: "can_be_ordered",
        label: "Rendelhető",
        description: "Ha be van kapcsolva, ez a termék megjelenik a rendelési listában.",
    },
    {
        type: "string",
        name: "categories",
        label: "Alcím",
    },
    {
        type: "datetime",
        name: "date",
        label: "Dátum",
    },
    {
        type: "image",
        name: "thumbnail",
        label: "Kép",
    },
    {
        type: "object",
        name: "table",
        label: "Ár táblázat",
        description: "Ártáblázat, ami megjelenik a termék saját oldalán.",
        list: true,
        ui: {
            itemProps: (item) => {
                return { label: `${item.title} - ${item.description}` };
            },
        },
        fields: [
            {
                type: "string",
                name: "title",
                label: "Ár címe",
            },
            {
                type: "string",
                name: "description",
                label: "Ár",
            },
        ],
    },
    {
        type: "string",
        name: "shortDescription",
        label: "Leírás",
        ui: {
            component: "textarea",
        },
    },
    {
        type: "rich-text",
        name: "content",
        label: "Tartalom",
        isBody: true,
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
        description: "Ha üres akkor 0.",
    },
    {
        type: "number",
        name: "discount",
        label: "Kedvezmény %",
        description: "Opcionális kedvezmény százalékban. A teljes árra lesz alkalmazva.",
    },
    {
        type: "datetime",
        name: "discount_valid_until",
        label: "Kedvezmény érvényességének vége",
        description:
            "Opcionális dátum, ami megadja, hogy a kedvezménynekm mikor legyen vége. Ha nincs megadva, akkor a kedvezmény mindig érvényes lesz.",
        ui: {
            component(props) {
                const discount = getValue(props, "discount");
                if (!discount) {
                    return null;
                }

                return DateField(props as any);
            },
        },
    },
    {
        type: "object",
        name: "materials",
        label: "Anyagok",
        description:
            "A termékhez tartozó anyagok beállításai. Ha nincs egy se hozzáadva, akkor a termékhez nem lesz anyag kiválasztási lehetőség a rendelési felületen.",
        fields: [
            {
                type: "object",
                name: "materials",
                list: true,
                label: "Anyag lista",
                description:
                    "A termékhez tartozó anyagok listája. Ha nincs egy se hozzáadva, akkor a termékhez nem lesz anyag kiválasztási lehetőség a rendelési felületen.",
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
                        description:
                            "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni. Ha nincs megadva akkor 0.",
                    },
                    {
                        type: "string",
                        name: "color_count",
                        label: "Választható színek/minták száma",
                        description:
                            "Az alap 1. Ha egy másik mező az alapja, írd be a Mező ID-jét. A Mezó szám alapú legyen.",
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
                name: "banned_combinations",
                list: true,
                label: "Tiltott anyag kombinációk",
                description:
                    "Olyan anyag kombinációk, amik nem rendelhetőek együtt. Ha nincs egy se hozzáadva, akkor a termékhez nem lesz anyag kombinációs korlátozás a rendelési felületen.",
                ui: {
                    itemProps: (item) => {
                        return {
                            label: item?.materials?.map((m: any) => m.material_path).join(", ") || "Új kombináció",
                        };
                    },
                },
                fields: [
                    {
                        type: "object",
                        name: "materials",
                        list: true,
                        label: "Tiltott anyag kombináció",
                        description:
                            "Olyan anyag kombinációk, amik nem rendelhetőek együtt. Annyi anyagból állhat egy kombináció, amennyit a 'Szükséges anyagok száma' mezőben megadtál.",
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
                        ],
                    },
                ],
            },
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
                                if (length_based_pricing_source) {
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
