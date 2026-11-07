import type { OrderLine, RequestContext } from "@vendure/core";
import { messages } from "../../shared/messages";
import { lineRejection, type LineFacts } from "./line-rejection";
import { valueVariantLine, type LineValuationDeps } from "./line-valuation";

export type LineInvalidCode = "VARIANT_UNAVAILABLE" | "OPTION_NOT_OFFERED";

export interface LineInvalidReason {
  code: LineInvalidCode;
  message: string;
}

export interface LineInvalidReasonDeps extends LineValuationDeps {
  lineFacts(ctx: RequestContext): LineFacts;
}

/**
 * Why an order line can no longer be ordered as configured, or undefined when
 * it is fine. Shared by the shop API's `OrderLine.invalidReason` and the
 * transition guard, so the buyer sees exactly what blocks checkout.
 */
export async function lineInvalidReason(
  deps: LineInvalidReasonDeps,
  ctx: RequestContext,
  line: OrderLine
): Promise<LineInvalidReason | undefined> {
  const productId = Number(line.productVariant.productId);
  const m = messages(ctx.languageCode);
  const productName = (await deps.productName(ctx, productId)) ?? m.defaultProductName();

  if (!line.productVariant.enabled || line.productVariant.deletedAt !== null) {
    return {
      code: "VARIANT_UNAVAILABLE",
      message: m.variantUnavailable(productName),
    };
  }

  const definitionRow = await deps.findDefinition(ctx, productId);

  if (definitionRow === null) {
    return undefined;
  }

  const customFields = Object.fromEntries(Object.entries(line.customFields));
  const valuation = await valueVariantLine(deps, ctx, line.productVariant, customFields, 0);

  if (valuation.kind === "invalid") {
    return { code: "OPTION_NOT_OFFERED", message: valuation.message };
  }

  const rejection = await lineRejection(deps.lineFacts(ctx), {
    productId,
    languageCode: ctx.languageCode,
    customFields: line.customFields,
  });

  if (rejection !== undefined) {
    return { code: "OPTION_NOT_OFFERED", message: rejection };
  }

  return undefined;
}
