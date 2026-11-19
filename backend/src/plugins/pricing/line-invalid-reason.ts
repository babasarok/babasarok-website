import type { OrderLine, ProductVariant, RequestContext } from "@vendure/core";
import { messages } from "../../shared/messages";
import type { Refusal } from "../../shared/refusal";
import { lineRejection, type LineFacts } from "./line-rejection";
import { valueVariantLine, type LineValuationDeps } from "./line-valuation";

export type LineInvalidReason = Refusal;

export interface LineInvalidReasonDeps extends LineValuationDeps {
  lineFacts(ctx: RequestContext): LineFacts;
  saleableStock(ctx: RequestContext, variant: ProductVariant, lock: boolean): Promise<number>;
}

export interface LineInvalidReasonOptions {
  /** Lock the stock rows: the transition guard must not race a concurrent checkout. */
  lockStock?: boolean;
}

/**
 * Why an order line can no longer be ordered as configured, or undefined when
 * it is fine. Shared by the shop API's `OrderLine.invalidReason` and the
 * transition guard, so the buyer sees exactly what blocks checkout.
 */
export async function lineInvalidReason(
  deps: LineInvalidReasonDeps,
  ctx: RequestContext,
  line: OrderLine,
  options: LineInvalidReasonOptions = {}
): Promise<LineInvalidReason | undefined> {
  const productId = Number(line.productVariant.productId);
  const m = messages(ctx.languageCode);
  const productName = (await deps.productName(ctx, productId)) ?? m.defaultProductName();

  if (!line.productVariant.enabled || line.productVariant.deletedAt !== null) {
    return { code: "VARIANT_UNAVAILABLE", productName };
  }

  const stock = await deps.saleableStock(ctx, line.productVariant, options.lockStock ?? false);

  if (stock < line.quantity) {
    return { code: "OUT_OF_STOCK", productName };
  }

  const definitionRow = await deps.findDefinition(ctx, productId);

  if (definitionRow === null) {
    return undefined;
  }

  const customFields = Object.fromEntries(Object.entries(line.customFields));
  const valuation = await valueVariantLine(deps, ctx, line.productVariant, customFields);

  if (valuation.kind === "invalid") {
    return valuation.refusal;
  }

  const rejection = await lineRejection(deps.lineFacts(ctx), {
    productId,
    languageCode: ctx.languageCode,
    customFields: line.customFields,
  });

  if (rejection !== undefined) {
    return rejection;
  }

  return undefined;
}
