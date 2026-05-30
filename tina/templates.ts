import type { TinaField } from "tinacms";

export function about_templateFields(): TinaField<false>[] {
    return [
        {
            type: "boolean",
            name: "enable",
            label: "Bekapcsolva",
        },
        {
            type: "string",
            name: "topTitle",
            label: "Cím",
        },
        {
            type: "string",
            name: "title",
            label: "Cím tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "string",
            name: "content",
            label: "Tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "string",
            name: "button1Name",
            label: "Első gomb neve",
        },
        {
            type: "string",
            name: "button2Name",
            label: "Második gomb neve",
        },
        {
            type: "string",
            name: "button1Target",
            label: "Első gomb URL",
        },
        {
            type: "string",
            name: "button2Target",
            label: "Második gomb URL",
        },
        {
            type: "image",
            name: "image",
            label: "Kép",
        },
    ];
}
export function blog_section_templateFields(): TinaField<false>[] {
    return [
        {
            type: "boolean",
            name: "enable",
            label: "Bekapcsolva",
        },
        {
            type: "string",
            name: "topTitle",
            label: "Cím",
        },
        {
            type: "string",
            name: "title",
            label: "Cím tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "string",
            name: "buttonName",
            label: "Gomb tartalma",
        },
        {
            type: "string",
            name: "buttonTarget",
            label: "Gomb URL",
        },
    ];
}
export function blog_templateFields(): TinaField<false>[] {
    return [
        {
            type: "string",
            name: "title",
            label: "Cím",
        },
        {
            type: "datetime",
            name: "date",
            label: "Dátum",
        },
        {
            type: "image",
            name: "featureImage",
            label: "Kiemelt kép",
        },
        {
            type: "image",
            name: "postImage",
            label: "Bejegyzés kép (lehet ugyanaz, mint a kiemelt)",
        },
        {
            type: "string",
            name: "tags",
            label: "Tagek",
        },
        {
            type: "string",
            name: "categories",
            label: "Kategóriák",
        },
        {
            type: "rich-text",
            name: "content",
            label: "Tartalom",
            isBody: true,
        },
    ];
}
export function config_templateFields(): TinaField<false>[] {
    return [
        {
            type: "string",
            name: "baseURL",
            label: "Oldal URL",
        },
        {
            type: "string",
            name: "languageCode",
            label: "Nyelvi kód",
        },
        {
            type: "string",
            name: "title",
            label: "Cím",
        },
        {
            type: "object",
            name: "pagination",
            label: "Oldalankénti bejegyzések száma",
            fields: [
                {
                    type: "number",
                    name: "pagerSize",
                    label: "Egy oldalankénti bejegyzések száma",
                },
            ],
        },
    ];
}
export function hero_templateFields(): TinaField<false>[] {
    return [
        {
            type: "boolean",
            name: "enable",
            label: "Bekapcsolva",
        },
        {
            type: "string",
            name: "topTitle",
            label: "Cím",
        },
        {
            type: "string",
            name: "content",
            label: "Tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "string",
            name: "buttonName",
            label: "Gomb tartalma",
        },
        {
            type: "string",
            name: "buttonURL",
            label: "Gomb URL-e",
        },
        {
            type: "image",
            name: "image",
            label: "Kép",
        },
        {
            type: "image",
            name: "videoThumb",
            label: "Videó előnézet",
        },
        {
            type: "string",
            name: "videoURL",
            label: "Videó URL",
        },
    ];
}
export function menus_templateFields(): TinaField<false>[] {
    return [
        {
            type: "object",
            name: "main",
            label: "Főmenü",
            fields: [
                {
                    type: "object",
                    name: "main",
                    label: "Menü",
                    list: true,
                    fields: [
                        {
                            type: "string",
                            name: "name",
                            label: "Név",
                        },
                        {
                            type: "string",
                            name: "url",
                            label: "url",
                        },
                        {
                            type: "number",
                            name: "weight",
                            label: "Prioritás (kisebb érték, nagyobb prioritás)",
                        },
                    ],
                },
            ],
        },
        {
            type: "object",
            name: "sitemap",
            label: "Fenti Menü",
            list: true,
            fields: [
                {
                    type: "string",
                    name: "name",
                    label: "name",
                },
                {
                    type: "string",
                    name: "url",
                    label: "url",
                },
                {
                    type: "number",
                    name: "weight",
                    label: "weight",
                },
            ],
        },
    ];
}
export function parameters_templateFields(): TinaField<false>[] {
    return [
        {
            type: "string",
            name: "titleSeparator",
            label: "Cím elválasztó",
        },
        {
            type: "string",
            name: "titleAddition",
            label: "Cím kiegészítés",
        },
        {
            type: "string",
            name: "description",
            label: "Oldal leírása",
        },
        {
            type: "boolean",
            name: "alert",
            label: "Alert Enabled",
        },
        {
            type: "boolean",
            name: "alertDismissable",
            label: "Alert dismissable",
        },
        {
            type: "string",
            name: "alertText",
            label: "Alert text",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "string",
            name: "blogPageURL",
            label: "Referenciamunkák URL",
        },
        {
            type: "image",
            name: "logo",
            label: "Logó",
        },
        {
            type: "image",
            name: "footerLogo",
            label: "Footer Logó",
        },
        {
            type: "string",
            name: "contactLink",
            label: "Rendelés URL",
        },
        {
            type: "string",
            name: "copyright",
            label: "Copyright",
        },
        {
            type: "string",
            label: "Kapcsolat kérdőiv email cím/kód",
            name: "fabformURL",
            description:
                "A https://formsubmit.co elfogad email címet először, majd küld kódot az első alkalommal amit ide be lehet írni hogy a botok ne találják meg a beírt email címet a neten.",
        },
        {
            type: "string",
            label: "Automatikus email válasz tartalma (Nem Működik!)",
            name: "autoreply_message",
            description:
                "Ez az üzenet kerül elküldésre a felhasználónak (azzal együtt amit ő kitöltött), ha sikeresen elküldi a kapcsolat kérdőívet.",
        },
        {
            type: "string",
            label: "Sikeres kapcsolat kérdőív üzenet",
            name: "contact_success_message",
            description:
                "Ez az üzenetet mutatja az oldal a felhasználónak, ha sikeresen elküldi a kapcsolat kérdőívet.",
        },
        {
            type: "string",
            label: "Sikertelen kapcsolat kérdőív üzenet",
            name: "contact_error_message",
            description:
                "Ez az üzenetet mutatja az oldal a felhasználónak, ha sikertelenül küldi el a kapcsolat kérdőívet.",
        },
        {
            type: "object",
            name: "address",
            label: "Kapcsolat",
            fields: [
                {
                    type: "string",
                    name: "phone",
                    label: "Telefonszám",
                },
                {
                    type: "string",
                    name: "email",
                    label: "Email",
                },
                {
                    type: "string",
                    name: "address",
                    label: "Cím",
                },
                {
                    type: "string",
                    name: "openingHours",
                    label: "Elérhetőségi idő (nincs as oldalba beépítve)",
                },
            ],
        },
        {
            type: "object",
            name: "social",
            label: "Közösségi Média",
            list: true,
            fields: [
                {
                    type: "string",
                    name: "icon",
                    label: "Ikon (https://icon-sets.iconify.design/)",
                },
                {
                    type: "string",
                    name: "url",
                    label: "URL",
                },
                {
                    type: "number",
                    name: "weight",
                    label: "Prioritás (kisebb előrébb)",
                },
            ],
        },
    ];
}
export function product_section_templateFields(): TinaField<false>[] {
    return [
        {
            type: "boolean",
            name: "enable",
            label: "Bekapcsolva",
        },
        {
            type: "string",
            name: "topTitle",
            label: "Cím",
        },
        {
            type: "string",
            name: "title",
            label: "Cím tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "string",
            name: "buttonName",
            label: "Gomb tartalma",
        },
        {
            type: "string",
            name: "buttonTarget",
            label: "Gomb URL",
        },
        {
            type: "number",
            name: "itemCount",
            label: "Termékek száma",
        },
    ];
}

export function resume_templateFields(): TinaField<false>[] {
    return [
        {
            type: "boolean",
            name: "enable",
            label: "Bekapcsolva",
        },
        {
            type: "string",
            name: "topTitle",
            label: "Cím",
        },
        {
            type: "string",
            name: "title",
            label: "Cím tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "string",
            name: "tab1Name",
            label: "Tab 1 neve",
        },
        {
            type: "string",
            name: "tab2Name",
            label: "Tab 2 neve",
        },
        {
            type: "string",
            name: "tab1Target",
            label: "Tab 1 URL",
        },
        {
            type: "string",
            name: "tab2Target",
            label: "Tab 2 URL",
        },
        {
            type: "object",
            name: "education",
            label: "education",
            list: true,
            fields: [
                {
                    type: "string",
                    name: "content",
                    label: "Content",
                    ui: {
                        component: "textarea",
                    },
                },
                {
                    type: "image",
                    name: "image",
                    label: "Image",
                },
                {
                    type: "string",
                    name: "url",
                    label: "URL",
                },
            ],
        },
        {
            type: "object",
            name: "experience",
            label: "experience",
            list: true,
            fields: [
                {
                    type: "string",
                    name: "content",
                    label: "Content",
                    ui: {
                        component: "textarea",
                    },
                },
                {
                    type: "image",
                    name: "image",
                    label: "Image",
                },
                {
                    type: "string",
                    name: "url",
                    label: "URL",
                },
            ],
        },
    ];
}
export function service_templateFields(): TinaField<false>[] {
    return [
        {
            type: "boolean",
            name: "enable",
            label: "Bekapcsolva",
        },
        {
            type: "string",
            name: "topTitle",
            label: "Cím",
        },
        {
            type: "string",
            name: "title",
            label: "Cím tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "object",
            name: "service",
            label: "Termék ismertető",
            list: true,
            fields: [
                {
                    type: "string",
                    name: "content",
                    label: "Tartalom",
                    ui: {
                        component: "textarea",
                    },
                },
                {
                    type: "image",
                    name: "image",
                    label: "Ikon",
                },
            ],
        },
    ];
}
export function testimonial_templateFields(): TinaField<false>[] {
    return [
        {
            type: "boolean",
            name: "enable",
            label: "Bekapcsolva",
        },
        {
            type: "string",
            name: "topTitle",
            label: "Cím",
        },
        {
            type: "string",
            name: "title",
            label: "Cím tartalom",
            ui: {
                component: "textarea",
            },
        },
        {
            type: "object",
            name: "testimonial",
            label: "Vélemény",
            list: true,
            fields: [
                {
                    type: "string",
                    name: "name",
                    label: "Név",
                },
                {
                    type: "string",
                    name: "comment",
                    label: "Vélemény",
                },
                {
                    type: "string",
                    name: "time",
                    label: "Időpont",
                },
                {
                    type: "number",
                    name: "star",
                    label: "Csillagok száma",
                },
            ],
        },
    ];
}
