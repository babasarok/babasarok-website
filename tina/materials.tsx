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
        label: "Név",
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
                    "Egyedi! azonosító a színhez/mintához, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szin-1",
                label: "Kód",
                required: true,
            },
            {
                type: "string",
                name: "label",
                description: "A szín/minta neve, pl: Piros",
                label: "Név",
                required: true,
            },
            {
                type: "string",
                name: "hex",
                label: "Kód",
                description: "Megközelítőleges színe az anyagnak. Ha nincs kitöltve, akkor kép legyen.",
                ui: {
                    component: "color",
                },
            },
            {
                type: "image",
                name: "image",
                label: "Kép",
                description: "A szín/minta képe. Ha nincs kitöltve, akkor szín legyen.",
            },
        ],
    },
    {
        type: "image",
        name: "thumbnail",
        label: "Kép",
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
