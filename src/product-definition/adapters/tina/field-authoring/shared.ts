import type { TinaField } from "tinacms";
import { PRODUCT_FIELD_TYPES } from "../../../../lib/product/fieldTypes";

export const fieldIdField = {
  type: "string",
  name: "name",
  label: "Mező ID",
  description:
    "Egyedi! azonosító a mezőhöz, csak angol karaktereket és számokat tartalmazhat, szóköz nélkül. Pl: meret",
  required: true,
} satisfies TinaField;

export const fieldLabelField = {
  type: "string",
  name: "label",
  label: "Mező név",
  description: "A mező megjelenítendő neve, ami a felhasználó számára látható.",
  isTitle: true,
  required: true,
} satisfies TinaField;

export const fieldTypeField = {
  type: "string",
  name: "type",
  label: "Mező típus",
  description: "A mező típusa, ami meghatározza, hogy az adatokat milyen formában kell megadni.",
  required: true,
  options: PRODUCT_FIELD_TYPES.map(({ value, label }) => ({ value, label })),
} satisfies TinaField;

export const fieldPriceField = {
  type: "number",
  name: "price",
  label: "Ár",
  description:
    "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni.",
} satisfies TinaField;

export const fieldTooltipField = {
  type: "string",
  name: "tooltip",
  label: "Tooltip",
  description:
    "Opcionális leírás, ami megjelenik, amikor a felhasználó a lehetőség fölé viszi az egeret.",
} satisfies TinaField;

export const fieldItemsField = {
  type: "object",
  name: "items",
  label: "Választási lehetőségek",
  description: "A mezőhöz tartozó választható lehetőségek.",
  list: true,
  ui: {
    itemProps: (item: { label?: string | null; value?: string | null }) => ({
      label: item.label || item.value || "Új mező",
    }),
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
    },
    {
      type: "string",
      name: "tooltip",
      label: "Tooltip",
      description:
        "Opcionális leírás, ami megjelenik, amikor a felhasználó a lehetőség fölé viszi az egeret.",
    },
  ],
} satisfies TinaField;

export const fieldPatternField = {
  type: "string",
  name: "regex",
  label: "Érvényességi minta (regex)",
  description: "Opcionális reguláris kifejezés, aminek a mező értékének meg kell felelnie.",
} satisfies TinaField;

export const fieldPlaceholderField = {
  type: "string",
  name: "placeholder",
  label: "Placeholder",
  description: "A mező helykitöltő szövege, ami megjelenik, amikor nincs kiválasztott érték.",
} satisfies TinaField;

export const fieldVisibilityField = {
  type: "object",
  name: "depends_on",
  label: "Feltételes megjelenítés",
  description:
    "Ha be van állítva, ez a mező csak akkor jelenik meg a rendelési felületen, ha a kiválasztott másik mező a megadott értékre van állítva.",
  fields: [
    {
      type: "string",
      name: "field",
      label: "Mező",
      description:
        "Válaszd ki, melyik másik mezőtől függjön ez a mező. Üresen hagyva a mező mindig látszik.",
    },
    {
      type: "string",
      name: "value",
      label: "Elvárt érték",
      description:
        "Opcionális. Ha megadod, a mező csak akkor jelenik meg, ha a fenti mező pontosan erre az értékre van állítva. Üresen hagyva elég, ha a fenti mező ki van töltve.",
    },
  ],
} satisfies TinaField;
