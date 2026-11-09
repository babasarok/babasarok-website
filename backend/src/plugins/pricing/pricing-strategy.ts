import { idsAreEqual, type PriceCalculationResult } from "@vendure/core";
import type {
  Injector,
  Order,
  OrderItemPriceCalculationStrategy,
  OrderLine,
  ProductVariant,
  RequestContext,
} from "@vendure/core";
import { TransactionalConnection } from "@vendure/core";
import { lineValuationDeps, valueVariantLine, type LineValuationDeps } from "./line-valuation";

function sameConfiguration(
  line: OrderLine,
  variant: ProductVariant,
  customFields: { [key: string]: unknown }
): boolean {
  return (
    idsAreEqual(line.productVariantId, variant.id) &&
    line.customFields.selections === customFields.selections &&
    (line.customFields.lengthCm ?? null) === (customFields.lengthCm ?? null)
  );
}

export async function calculateUnitPrice(
  deps: LineValuationDeps,
  ctx: RequestContext,
  productVariant: ProductVariant,
  orderLineCustomFields: { [key: string]: unknown },
  order: Order
): Promise<PriceCalculationResult> {
  const valuation = await valueVariantLine(deps, ctx, productVariant, orderLineCustomFields);

  if (valuation.kind === "passThrough") {
    return {
      price: productVariant.listPrice,
      priceIncludesTax: productVariant.listPriceIncludesTax,
    };
  }

  if (valuation.kind === "priced") {
    return { price: valuation.price, priceIncludesTax: productVariant.listPriceIncludesTax };
  }

  const existingLine = order.lines.find((line) =>
    sameConfiguration(line, productVariant, orderLineCustomFields)
  );

  if (existingLine === undefined) {
    throw new Error(valuation.message);
  }

  return {
    price: existingLine.listPrice,
    priceIncludesTax: existingLine.listPriceIncludesTax,
  };
}

/**
 * The order item price strategy for the generated catalog (ADR 0010 decision
 * 6): configured lines price from the canonical definition and the line's
 * selections, everything else passes the variant's price through — the
 * quote-order placeholders keep their client-quoted totals. A line already on
 * the order that its definition can no longer price keeps its last price, so
 * unrelated recalculations work; the transition guard refuses to place it.
 */
export class ServerPricingStrategy implements OrderItemPriceCalculationStrategy {
  private deps!: LineValuationDeps;

  init(injector: Injector): void {
    this.deps = lineValuationDeps(injector.get(TransactionalConnection));
  }

  calculateUnitPrice(
    ctx: RequestContext,
    productVariant: ProductVariant,
    orderLineCustomFields: { [key: string]: unknown },
    order: Order,
    _quantity: number
  ): Promise<PriceCalculationResult> {
    return calculateUnitPrice(this.deps, ctx, productVariant, orderLineCustomFields, order);
  }
}
