import { Channel, LanguageCode, ProductVariant, RequestContext } from "@vendure/core";
import { describe, expect, it } from "vitest";
import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import { ProductDefinition } from "../product/product.entity";
import { valueVariantLine, type LineValuationDeps } from "./line-valuation";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  basePrice: 1000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "kicsi", label: { hu: "Kicsi" }, price: 0 },
        { id: "nagy", label: { hu: "Nagy" }, price: 500 },
      ],
      customValue: {},
    },
  ],
});

const ctx = new RequestContext({
  apiType: "shop",
  isAuthorized: false,
  authorizedAsOwnerOnly: false,
  channel: new Channel(),
  languageCode: LanguageCode.hu,
});

const deps: LineValuationDeps = {
  findDefinition: async () => new ProductDefinition({ definition, productId: "parna" }),
  productName: async () => "Párna",
};

const nagyVariant = new ProductVariant({ id: 7, productId: 3, listPrice: 1500 });

describe("valueVariantLine", () => {
  it.each([
    ["the picked option", { meret: { kind: "option", value: "nagy" } }, 1500],
    ["the default without a selection", {}, 1000],
    ["the default for an unlisted custom value", { meret: { kind: "custom", value: "xyz" } }, 1000],
  ])("prices %s, whatever the variant", async (_name, selections, price) => {
    expect(
      await valueVariantLine(deps, ctx, nagyVariant, { selections: JSON.stringify(selections) })
    ).toEqual({ kind: "priced", price });
  });
});
