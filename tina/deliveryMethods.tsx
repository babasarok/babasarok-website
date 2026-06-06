import type { TinaField } from "tinacms";

export const DELIVER_METHODS: TinaField<false>[] = [
    {
        type: "string",
        name: "delivery_name",
        description:
            "Egyedi! azonosító a szállítási módhoz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: szallitas-1",
        label: "Szállítási mód ID",
        required: true,
    },
    {
        type: "string",
        name: "name",
        description: "A szállítási mód megjelenítendő neve, ami a felhasználó számára látható.",
        label: "Szállítási mód név",
        required: true,
    },
    {
        type: "number",
        name: "price",
        label: "Ár - Forintban",
        required: true,
    },
];
