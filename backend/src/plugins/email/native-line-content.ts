import { selectionDetails } from "../../shared/product-definition/index";
import type { TransactionalConnection } from "@vendure/core";
import type { Order, RequestContext } from "@vendure/core";
import { In } from "typeorm";
import { productionDefaults, resolveProductionDays } from "../product/production-days";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition as ProductDefinitionEntity } from "../product/product.entity";
import { selectionLabels, selectionsOf } from "../product/line-labels";
import { loadVariantOptionDetails } from "./variant-option-details";
import type { NativeLineContent } from "./order-email-view";

/**
 * Each order line's title and visible configuration from its `selections`
 * and the product's canonical definition, aligned with `order.lines`. The
 * order's lines must have their product variant and product loaded.
 */
export async function loadNativeLineContent(
  connection: TransactionalConnection,
  ctx: RequestContext,
  order: Order
): Promise<NativeLineContent[]> {
  const productIds = order.lines.map((line) => Number(line.productVariant.productId));
  const names = await nativeProductNames(connection, ctx, productIds);
  const rows = await connection
    .getRepository(ctx, ProductDefinitionEntity)
    .find({ where: { nativeProductId: In(productIds) } });
  const definitions = new Map(rows.map((row) => [row.nativeProductId, row.definition]));
  const selections = order.lines.map((line) => selectionsOf(line.customFields.selections));
  const labels = await selectionLabels(connection, ctx, selections);
  const variantIds = order.lines.map((line) => Number(line.productVariant.id));
  const optionDetails = await loadVariantOptionDetails(connection, ctx, variantIds);
  const defaults = productionDefaults(
    ctx.channel.customFields.configuratorProductionDays,
    ctx.channel.customFields.readyMadeProductionDays
  );

  return order.lines.map((line, index) => {
    const productId = Number(line.productVariant.productId);
    const definition = definitions.get(productId);
    const title = names.get(productId) ?? line.productVariant.name;
    const productionDays = resolveProductionDays(
      line.productVariant.product.customFields.productionDays,
      definition !== undefined,
      defaults
    );

    if (definition === undefined) {
      return {
        title,
        stocked: true,
        productionDays,
        details: optionDetails.get(String(line.productVariant.id)) ?? [],
      };
    }

    return {
      title,
      stocked: false,
      productionDays,
      details: selectionDetails({
        definition,
        selections: selections[index],
        lengthCm: line.customFields.lengthCm ?? null,
        labels,
        languageCode: ctx.languageCode,
      }),
    };
  });
}
