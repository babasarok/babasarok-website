import { EntityHydrator } from "@vendure/core";
import type { Injector, OrderProcess, OrderTransitionData } from "@vendure/core";
import { isLegacyQuoteOrder } from "../quote-order/legacy-order";
import { checkoutRefusal } from "./checkout-readiness";

/** Refuses to place an order that lacks contact, delivery or the accepted terms. */
export class CheckoutReadinessProcess implements OrderProcess<string> {
  private entityHydrator!: EntityHydrator;

  init(injector: Injector): void {
    this.entityHydrator = injector.get(EntityHydrator);
  }

  async onTransitionStart(
    fromState: string,
    toState: string,
    { ctx, order }: OrderTransitionData
  ): Promise<string | undefined> {
    if (fromState !== "AddingItems" || toState !== "ArrangingPayment") {
      return undefined;
    }

    if (isLegacyQuoteOrder(order)) {
      return undefined;
    }

    await this.entityHydrator.hydrate(ctx, order, {
      relations: ["lines", "customer", "shippingLines", "shippingLines.shippingMethod"],
    });

    const shippingMethod = order.shippingLines.at(0)?.shippingMethod;

    return checkoutRefusal({
      lineCount: order.lines.length,
      hasCustomer: order.customer != null,
      hasShippingMethod: shippingMethod !== undefined,
      termsAccepted: order.customFields.termsAccepted === true,
      shippingMethodRequiresAddress: shippingMethod?.customFields.requiresAddress === true,
      hasAddress: (order.shippingAddress.streetLine1 ?? "").trim() !== "",
    });
  }
}
