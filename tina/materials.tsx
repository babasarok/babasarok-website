import type { TinaField } from "tinacms";

export const MATERIALS: TinaField[] = [
    {
        type: "string",
        name: "material_id",
        description:
            "Egyedi! azonosító az anyaghoz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: anyag-1",
        label: "Anyag ID",
        required: true,
    },
    {
        type: "string",
        name: "label",
        description: "Az anyag neve, pl: Velúr",
        label: "Anyag neve",
        required: true,
    },
    {
        type: "object",
        name: "colors",
        list: true,
        label: "Színek/minták",
        description: "A termékhez tartozó színek vagy minták.",
        ui: {
            itemProps: (item) => {
                return { label: item?.label || "Új mező" };
            },
        },
        fields: [
            {
                type: "string",
                name: "color_id",
                description:
                    "Egyedi! azonosító a színhez, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szin-1",
                label: "Színkód",
                required: true,
            },
            {
                type: "string",
                name: "label",
                description: "A szín neve, pl: Piros",
                label: "Szín neve",
                required: true,
            },
            {
                type: "string",
                name: "hex",
                label: "Színkód",
                description: "Megközelítőleges színe az anyagnak.",
                ui: {
                    component: "color",
                },
            },
        ],
    },
    {
        type: "string",
        name: "categories",
        label: "Alcím",
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
];
