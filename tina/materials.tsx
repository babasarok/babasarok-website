import type { TinaField } from "tinacms";

export interface MaterialColor {
    color_id: string;
    label: string;
    color_name?: string;
}

export interface Material {
    material_id: string;
    label: string;
    colors: MaterialColor[];
}

export const MATERIALS: TinaField[] = [
    {
        type: "string",
        name: "material_id",
        description: "Egyedi! azonosító az anyaghoz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: anyag-1",
        label: "Anyag ID",
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
        label: "Színek",
        description: "A termékhez tartozó egyedi mezők. A sorrendjük meghatározza a megjelenítésük sorrendjét.",
        ui: {
            itemProps: (item) => {
                return { label: item?.label || "Új mező" };
            },
        },
        fields: [
            {
                type: "string",
                name: "color_id",
                description: "Egyedi! azonosító a színhez, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szin-1",
                label: "Szín ID",
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
                name: "color_name",
                label: "Színkód",
                description: "Megközelítőleges színe az anyagnak.",
                ui: {
                    component: "color"
                }
            }
        ]
    }
]
