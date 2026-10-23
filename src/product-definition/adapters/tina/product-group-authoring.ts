import { defineAuthoringForm } from "../../../../tina/lib/define-authoring-form";
import { ProductGroupDefinitionSchema } from "../../product-group";

export function validateProductGroupDiscount(value?: number): string | undefined {
  return value != null && (value < 0 || !Number.isInteger(value))
    ? "A kedvezménynek 0 vagy annál nagyobb egész számnak kell lennie."
    : undefined;
}

export const productGroupAuthoring = defineAuthoringForm({
  schema: ProductGroupDefinitionSchema,
  fields: [
    {
      meaning: { kind: "canonical", property: "id" },
      field: {
        type: "string",
        name: "product_group_id",
        label: "Termékcsoport ID",
        description: "Egyedi azonosító a termékcsoporthoz. Létrehozás után ne változtasd meg.",
        required: true,
      },
    },
    {
      meaning: { kind: "canonical", property: "label" },
      field: {
        type: "string",
        name: "title",
        label: "Csoport neve",
        description: "A termékcsoport neve.",
        isTitle: true,
        required: true,
      },
    },
    {
      meaning: { kind: "canonical", property: ["kind", "discount"] },
      field: {
        type: "number",
        name: "discount_amount",
        label: "Szett kedvezmény (Ft)",
        description:
          "Opcionális fix forint kedvezmény, amit a szett minden összeálló példánya egyszer kap, ha a tagjait együtt rendelik. 0 vagy üres érték esetén a csoport nem ad kedvezményt (kapcsolódó termékként jelenik meg). Ha egy termék több szettben is szerepel, a legnagyobb kedvezményt adó szett érvényesül.",
        ui: { validate: validateProductGroupDiscount },
      },
    },
    {
      meaning: { kind: "canonical", property: "productIds" },
      field: {
        type: "object",
        name: "products",
        label: "Termékek",
        description: "A termékek listája.",
        list: true,
        ui: {
          itemProps: (item: { product?: string | null }) => ({
            label: item.product || "Új termék",
          }),
        },
        fields: [
          {
            type: "reference",
            collections: ["product"],
            name: "product",
            label: "Termék",
            description: "A termék, amelyet a csoporthoz adunk.",
            required: true,
          },
        ],
      },
    },
    {
      meaning: { kind: "presentation" },
      field: {
        type: "rich-text",
        name: "body",
        label: "Leírás",
        description:
          "Opcionális leírás/tartalom a szetthez. Jelenleg nem jelenik meg, de megőrizzük későbbi megjelenítéshez.",
        isBody: true,
      },
    },
  ],
});
