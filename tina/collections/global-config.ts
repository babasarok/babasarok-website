import type { Collection } from "tinacms";

export const GlobalConfigCollection: Collection = {
  name: "config",
  label: "Config Fájl",
  path: "src/content/config",
  format: "json",

  ui: {
    global: true,
    allowedActions: {
      create: false,
      delete: false,
    },
  },
  fields: [
    {
      type: "string",
      name: "title",
      label: "Cím",
      required: true,
    },
    {
      type: "string",
      name: "description",
      label: "Oldal leírása (SEO)",
    },
    {
      type: "string",
      name: "ogLocale",
      label: "OG Locale (pl. hu_HU)",
    },
    {
      type: "string",
      name: "themeColor",
      label: "Böngésző chrome szín (hex)",
    },
    {
      type: "object",
      name: "mainMenu",
      label: "Főmenü",
      list: true,
      fields: [
        { type: "string", name: "name", label: "Név" },
        { type: "string", name: "url", label: "URL" },
        { type: "number", name: "weight", label: "Sorrend" },
      ],
    },
    {
      type: "object",
      name: "sitemapMenu",
      label: "Lábléc oldaltérkép",
      list: true,
      fields: [
        { type: "string", name: "name", label: "Név" },
        { type: "string", name: "url", label: "URL" },
        { type: "number", name: "weight", label: "Sorrend" },
      ],
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
      label: "Rendelés oldal URL",
    },
    {
      type: "string",
      name: "copyright",
      label: "Copyright",
    },
    {
      type: "string",
      label: "Rendelés form kód",
      name: "fabformURL",
      description: "A https://web3forms.com-ról származó form kód.",
    },
    {
      type: "object",
      name: "footerContact",
      label: "Footer Kapcsolat Doboz",
      fields: [
        {
          type: "string",
          name: "topTitle",
          label: "Felső cím",
        },
        {
          type: "string",
          name: "title",
          label: "Cím",
        },
        {
          type: "string",
          name: "button",
          label: "Gomb szöveg",
        },
      ],
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
  ],
};
