import {
  ToggleField,
  GroupListField,
  TextField,
  SelectField,
  DateField,
  type Collection,
} from "tinacms";
import { getValue, requiredListItemsBeforeSubmit, slugify } from "../lib/utils";
import {
  canSupplyStringValue,
  EMBROIDERY_PRICE_UNITS,
  hasResolvableValue,
  isProductFieldType,
  PRODUCT_FIELD_TYPES,
} from "../../src/lib/product/fieldTypes";

/**
 * Products ("Termékek") — backs `src/content/product/*.md` and the `/product`
 * list + single pages. Ported from the old Hugo project's product configurator
 * so the full ordering schema (materials, fields, pricing) keeps working in
 * Tina. The Astro site only renders a subset (title, thumbnail, images,
 * shortDescription, body); the rest drives the order form.
 *
 * `materials`/`banned_combinations` reference the `product_materials`
 * collection, so that collection must stay registered alongside this one.
 */
export const ProductCollection: Collection = {
  name: "product",
  label: "Termékek",
  path: "src/content/product",
  format: "md",
  frontmatterFormat: "yaml",
  match: {
    include: "**/*",
  },
  ui: {
    beforeSubmit: requiredListItemsBeforeSubmit,
    filename: {
      // optional: stop editors from typing the name freehand
      readonly: true,
      slugify: (values) => {
        const base = slugify(String(values.title ?? ""));
        return base || "untitled";
      },
    },
  },
  fields: [
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
      description:
        "Ha be van kapcsolva, ez a termék nem fog megjelenni a termékek listájában a 'Termékek' között.",
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
      required: true,
    },
    {
      type: "image",
      name: "thumbnail",
      label: "Kép",
    },
    {
      type: "object",
      name: "images",
      list: true,
      label: "Képek",
      description: "A termékhez tartozó képek listája.",
      ui: {
        itemProps: (item) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
          return { label: item?.image || "Új kép" };
        },
      },
      fields: [
        {
          type: "image",
          name: "image",
          label: "Kép",
        },
        {
          type: "string",
          name: "description",
          label: "Leírás",
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
      type: "object",
      name: "length_based_pricing",
      label: "Méteráru",
      description:
        "Méteráru termékekhez: válaszd ki, melyik mező adja az ár alapját (cm-ben). A kikapcsoláshoz válaszd a „— Nem méteráru —” lehetőséget.",
      fields: [
        {
          type: "string",
          name: "sourceField",
          label: "Árforrás mező",
          description:
            "Az a mező, amelyik a méteráru számítás alapját adja. A mező értéke cm-ben kell legyen.",
          ui: {
            component(props) {
              // Populate from this product's own fields so editors pick an
              // existing field ID; the empty option turns off méteráru pricing.
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const productFields = getValue(props, "../fields") ?? [];
              const options = [
                { value: "", label: "— Nem méteráru —" },
                ...(
                  productFields as {
                    name?: string | null;
                    label?: string | null;
                    type?: string | null;
                  }[]
                )
                  .filter(
                    (f) =>
                      !!f.name &&
                      !!f.type &&
                      isProductFieldType(f.type) &&
                      canSupplyStringValue(f.type)
                  )
                  .map((f) => ({ value: f.name ?? "", label: f.label || (f.name ?? "") })),
              ];

              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument
              return SelectField({
                ...props,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                field: { ...props.field, options } as any,
                options,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any);
            },
            validate(value, allValues) {
              if (!value) {
                return;
              }
              const productFields =
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                ((allValues as any)?.fields ?? []) as { name?: string | null }[];
              if (!productFields.some((f) => f.name === value)) {
                return `Nincs ilyen mező: "${value}". Válassz a termék mezői közül.`;
              }
            },
          },
        },
      ],
    },
    {
      type: "number",
      name: "price",
      label: "Alap Ár - Forintban",
      description: "Ha üres akkor 0.",
      required: true,
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const discount = getValue(props, "discount");
          if (!discount) {
            return null;
          }

          // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
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
      ui: {
        defaultItem: {
          material_required_count: 0,
        },
      },
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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
              return { label: item?.material_path || "Új anyag" };
            },
            defaultItem: {
              material_path: "",
              price: 0,
              color_count: "1",
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
              required: true,
            },
            {
              type: "string",
              name: "color_count",
              label: "Választható színek/minták száma",
              description:
                "Az alap 1. Ha egy másik mező az alapja, írd be a Mező ID-jét. A Mezó szám alapú legyen.",
              required: true,
            },
          ],
        },
        {
          type: "number",
          name: "material_required_count",
          label: "Szükséges anyagok száma",
          description:
            "Ennek a terméknek a rendeléséhez hány anyagra van szükség. Ez csak akkor lesz releváns, ha anyagokat adtál hozzá a termékhez. Az alap 1.",
          required: true,
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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                label:
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
                  item?.materials?.map((m: any) => m.material_path).join(", ") || "Új kombináció",
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
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
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
      description:
        "A termékhez tartozó egyedi mezők. A sorrendjük meghatározza a megjelenítésük sorrendjét.",
      ui: {
        itemProps: (item) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
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
          description:
            "A mező típusa, ami meghatározza, hogy az adatokat milyen formában kell megadni.",
          required: true,
          options: PRODUCT_FIELD_TYPES.map((t) => ({ value: t.value, label: t.label })),
          label: "Mező típus",
        },
        {
          type: "number",
          name: "price",
          label: "Ár",
          description:
            "Az opció ára, amit a rendszer használ. Méteráru esetén a per méter árat kell megadni.",
          ui: {
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
          type: "boolean",
          name: "optional",
          description: "Jelzi, hogy a mező opcionális-e.",
          label: "Opcionális mező",
          ui: {
            component(props) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const typeValue = getValue(props, "type");
              if (typeValue !== "input") {
                return null;
              }

              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
              return ToggleField(props as any);
            },
          },
        },
        {
          type: "string",
          name: "price_unit",
          label: "Árazás módja",
          description:
            "Hímzésnél: fix ár vagy szavankénti ár. A mező ára az itt választott egységre vonatkozik.",
          options: EMBROIDERY_PRICE_UNITS.map((unit) => ({
            value: unit.value,
            label: unit.label,
          })),
          ui: {
            component(props) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const type = getValue(props, "type");
              if (type !== "embroidery") {
                return null;
              }

              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
              return SelectField(props as any);
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
        {
          type: "object",
          list: true,
          name: "items",
          label: "Választási lehetőségek",
          description: "A mezőhöz tartozó választható lehetőségek.",
          ui: {
            itemProps: (item) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition
              return { label: item?.label || item?.value || "Új mező" };
            },
            component(props) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const type = getValue(props, "type");
              if (type === "toggle" || type === "embroidery") {
                return null;
              }

              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const typeValue = getValue(props, "type");
              if (typeValue != "select" && typeValue != "radio" && typeValue != "color") {
                return null;
              }

              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
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
          type: "string",
          name: "placeholder",
          label: "Placeholder",
          description:
            "A mező helykitöltő szövege, ami megjelenik, amikor nincs kiválasztott érték.",
          ui: {
            component(props) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const typeValue = getValue(props, "type");
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              const allowCustomValue = getValue(props, "allow_custom_value");
              if (typeValue === "select" && !allowCustomValue) {
                return null;
              }

              if (typeValue === "radio" && !allowCustomValue) {
                return null;
              }

              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
              return TextField(props as any);
            },
          },
        },
        {
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
              ui: {
                component(props) {
                  // Populate the dropdown from this product's own fields so
                  // editors pick an existing field ID instead of typing one.
                  // The current field is excluded to prevent self-dependency.
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  const ownName = getValue(props, "../name");
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  const productFields = getValue(props, "../../../fields") ?? [];
                  const options = [
                    { value: "", label: "— Mindig látszik —" },
                    ...(
                      productFields as {
                        name?: string | null;
                        label?: string | null;
                        type?: string | null;
                      }[]
                    )
                      .filter(
                        (f) =>
                          !!f.name &&
                          f.name !== ownName &&
                          !!f.type &&
                          isProductFieldType(f.type) &&
                          hasResolvableValue(f.type)
                      )
                      .map((f) => ({ value: f.name ?? "", label: f.label || (f.name ?? "") })),
                  ];

                  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument
                  return SelectField({
                    ...props,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                    field: { ...props.field, options } as any,
                    options,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any);
                },
                validate(value, allValues) {
                  if (!value) {
                    return;
                  }
                  const productFields =
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
                    ((allValues as any)?.fields ?? []) as { name?: string | null }[];
                  if (!productFields.some((f) => f.name === value)) {
                    return `Nincs ilyen mező: "${value}". Válassz a termék mezői közül.`;
                  }
                },
              },
            },
            {
              type: "string",
              name: "value",
              label: "Elvárt érték",
              description:
                "Opcionális. Ha megadod, a mező csak akkor jelenik meg, ha a fenti mező pontosan erre az értékre van állítva. Üresen hagyva elég, ha a fenti mező ki van töltve.",
              ui: {
                component(props) {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  const name = getValue(props, "field");
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  const productFields = getValue(props, "../../../fields") ?? [];
                  const target = (
                    productFields as {
                      name?: string | null;
                      type?: string | null;
                      items?: ({ value?: string | null; label?: string | null } | null)[] | null;
                    }[]
                  ).find((f) => f.name === name);

                  // No dependency chosen yet, or a free-form field → plain text input.
                  if (!name || !target || target.type === "input") {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
                    return TextField(props as any);
                  }

                  const valueOptions =
                    target.type === "toggle"
                      ? [
                          { value: "true", label: "Igen" },
                          { value: "false", label: "Nem" },
                        ]
                      : (target.items ?? [])
                          .filter((i) => !!i?.value)
                          .map((i) => ({
                            value: i?.value ?? "",
                            label: i?.label || (i?.value ?? ""),
                          }));

                  const options = [{ value: "", label: "Bármelyik érték" }, ...valueOptions];

                  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument
                  return SelectField({
                    ...props,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                    field: { ...props.field, options } as any,
                    options,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  } as any);
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
