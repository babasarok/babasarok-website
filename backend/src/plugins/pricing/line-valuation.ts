import type { EntityHydrator, ProductVariant, RequestContext } from "@vendure/core";
import type { TransactionalConnection } from "@vendure/core";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import { valueConfiguredLine, type LineValuation } from "./line-price";
import { parseLineSelections } from "@babasarok/pricing";

export type VariantLineValuation = LineValuation | { kind: "passThrough" };

export interface LineValuationDeps {
  findDefinition(ctx: RequestContext, productId: number): Promise<ProductDefinition | null>;
  productName(ctx: RequestContext, productId: number): Promise<string | undefined>;
  hydrateOptions(ctx: RequestContext, productVariant: ProductVariant): Promise<void>;
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
    hydrateOptions: async (ctx, productVariant) => {
      await entityHydrator.hydrate(ctx, productVariant, {
        relations: ["options", "options.group"],
      });
    },
  };
}

/**
 * The one decision on whether a variant plus line custom fields is priceable
 * from its current definition; shared by the pricing strategy and the
 * order-transition guard. Variants without a definition pass through.
 */
export async function valueVariantLine(
  deps: LineValuationDeps,
  ctx: RequestContext,
  productVariant: ProductVariant,
  orderLineCustomFields: { [key: string]: unknown },
  variantListPrice: number
): Promise<VariantLineValuation> {
  const productId = Number(productVariant.productId);
  const definitionRow = await deps.findDefinition(ctx, productId);

  if (definitionRow === null) {
    return { kind: "passThrough" };
  }

  await deps.hydrateOptions(ctx, productVariant);

  const productName = (await deps.productName(ctx, productId)) || definitionRow.productId;
  const rawLengthCm = orderLineCustomFields.lengthCm;

  return valueConfiguredLine({
    definition: definitionRow.definition,
    productName,
    variantListPrice,
    optionCodes: new Map(productVariant.options.map((option) => [option.group.code, option.code])),
    selections: parseLineSelections(orderLineCustomFields.selections),
    lengthCm: typeof rawLengthCm === "number" ? rawLengthCm : null,
    languageCode: ctx.languageCode,
  });
}
