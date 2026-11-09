import { ProductDefinitionSchema } from "../../shared/product-definition/index";
import { Channel, LanguageCode, OrderLine, ProductVariant, RequestContext } from "@vendure/core";
import { describe, expect, it } from "vitest";
import { ProductDefinition } from "../product/product.entity";
import { lineInvalidReason, type LineInvalidReasonDeps } from "./line-invalid-reason";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [],
});

const ctx = new RequestContext({
  apiType: "shop",
  isAuthorized: false,
  authorizedAsOwnerOnly: false,
  channel: new Channel(),
  languageCode: LanguageCode.hu,
});

function depsFor(row: ProductDefinition | null): LineInvalidReasonDeps {
  return {
    findDefinition: async () => row,
    productName: async () => "Párna",
    variantOptionCodes: async () => new Map(),
    lineFacts: () => ({
      generatedDefinition: async () => row?.definition,
      productName: async () => "Párna",
      materialColors: async () => new Map(),
      knownThreadColors: async () => new Set(),
    }),
  };
}

function lineOf(
  variantFields: Partial<ProductVariant>,
  selections: string | null = null
): OrderLine {
  return new OrderLine({
    productVariant: new ProductVariant({
      id: 7,
      productId: 3,
      enabled: true,
      deletedAt: null,
      listPrice: 9000,
      options: [],
      ...variantFields,
    }),
    customFields: { selections },
  });
}

const row = new ProductDefinition({ definition, productId: "parna" });

describe("lineInvalidReason", () => {
  it("is undefined for a line the definition still prices", async () => {
    expect(await lineInvalidReason(depsFor(row), ctx, lineOf({}))).toBeUndefined();
  });

  it("is undefined for a product without a definition", async () => {
    expect(await lineInvalidReason(depsFor(null), ctx, lineOf({}))).toBeUndefined();
  });

  it("reports a disabled variant", async () => {
    const reason = await lineInvalidReason(depsFor(row), ctx, lineOf({ enabled: false }));

    expect(reason?.code).toBe("VARIANT_UNAVAILABLE");
    expect(reason?.message).toContain("Párna");
  });

  it("reports a deleted variant", async () => {
    const reason = await lineInvalidReason(depsFor(row), ctx, lineOf({ deletedAt: new Date() }));

    expect(reason?.code).toBe("VARIANT_UNAVAILABLE");
  });

  it("reports selections the definition no longer offers", async () => {
    const reason = await lineInvalidReason(
      depsFor(row),
      ctx,
      lineOf({}, JSON.stringify({ gone: { kind: "option", value: "x" } }))
    );

    expect(reason?.code).toBe("OPTION_NOT_OFFERED");
  });
});
