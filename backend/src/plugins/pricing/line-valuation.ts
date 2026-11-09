import type { ProductVariant, RequestContext } from "@vendure/core";
import type { TransactionalConnection } from "@vendure/core";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import {
  parseLineSelections,
  valueConfiguredLine,
  type LineValuation,
} from "../../shared/pricing/index";

export type VariantLineValuation = LineValuation | { kind: "passThrough" };

export interface LineValuationDeps {
  findDefinition(ctx: RequestContext, productId: number): Promise<ProductDefinition | null>;
  productName(ctx: RequestContext, productId: number): Promise<string | undefined>;
}

export function lineValuationDeps(connection: TransactionalConnection): LineValuationDeps {
  return {
    findDefinition: (ctx, productId) =>
      connection
        .getRepository(ctx, ProductDefinition)
        .findOne({ where: { nativeProductId: productId } }),
    productName: async (ctx, productId) =>
      (await nativeProductNames(connection, ctx, [productId])).get(productId),
  };
}

/**
 * The one decision on whether a variant plus line custom fields is priceable
 * from its current definition; shared by the pricing strategy and the
 * order-transition guard. The price comes from the definition and the line's
 * selections, never the variant. Variants without a definition pass through.
 */
export async function valueVariantLine(
  deps: LineValuationDeps,
  ctx: RequestContext,
  productVariant: ProductVariant,
  orderLineCustomFields: { [key: string]: unknown }
): Promise<VariantLineValuation> {
  const productId = Number(productVariant.productId);
  const definitionRow = await deps.findDefinition(ctx, productId);

  if (definitionRow === null) {
    return { kind: "passThrough" };
  }

  const productName = (await deps.productName(ctx, productId)) || definitionRow.productId;
  const rawLengthCm = orderLineCustomFields.lengthCm;
  return valueConfiguredLine({
    definition: definitionRow.definition,
    productName,
    selections: parseLineSelections(orderLineCustomFields.selections, ctx.languageCode),
    lengthCm: typeof rawLengthCm === "number" ? rawLengthCm : null,
    languageCode: ctx.languageCode,
  });
}
