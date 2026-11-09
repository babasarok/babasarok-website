import type { EntityHydrator, ProductVariant, RequestContext } from "@vendure/core";
import type { TransactionalConnection } from "@vendure/core";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import {
  parseLineSelections,
  unpricedLineMessage,
  valueConfiguredLine,
  type LineValuation,
} from "../../shared/pricing/index";
import { variantDisagreement, variantOptionCodes } from "./variant-agreement";

export type VariantLineValuation = LineValuation | { kind: "passThrough" };

export interface LineValuationDeps {
  findDefinition(ctx: RequestContext, productId: number): Promise<ProductDefinition | null>;
  productName(ctx: RequestContext, productId: number): Promise<string | undefined>;
  variantOptionCodes(
    ctx: RequestContext,
    productVariant: ProductVariant
  ): Promise<ReadonlyMap<string, string>>;
}

export function lineValuationDeps(
  connection: TransactionalConnection,
  entityHydrator: EntityHydrator
): LineValuationDeps {
  return {
    findDefinition: (ctx, productId) =>
      connection
        .getRepository(ctx, ProductDefinition)
        .findOne({ where: { nativeProductId: productId } }),
    productName: async (ctx, productId) =>
      (await nativeProductNames(connection, ctx, [productId])).get(productId),
    variantOptionCodes: (ctx, productVariant) =>
      variantOptionCodes(entityHydrator, ctx, productVariant),
  };
}

/**
 * The one decision on whether a variant plus line custom fields is priceable
 * from its current definition; shared by the pricing strategy and the
 * order-transition guard. The price comes from the definition and the line's
 * selections; the variant must still agree with them. Variants without a
 * definition pass through.
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
  const selections = parseLineSelections(orderLineCustomFields.selections);
  const disagreement = variantDisagreement(
    definitionRow.definition,
    selections,
    await deps.variantOptionCodes(ctx, productVariant),
    ctx.languageCode
  );

  if (disagreement !== undefined) {
    return { kind: "invalid", message: unpricedLineMessage(productName, disagreement) };
  }

  return valueConfiguredLine({
    definition: definitionRow.definition,
    productName,
    selections,
    lengthCm: typeof rawLengthCm === "number" ? rawLengthCm : null,
    languageCode: ctx.languageCode,
  });
}
