import { EntityHydrator, OrderStateTransitionEvent } from "@vendure/core";
import { EmailEventListener } from "@vendure/email-plugin";
import { env } from "../env";

// "Order placed" for a quote shop: the submission transitions AddingItems ->
// ArrangingPayment and there is no payment step.
function onOrderPlaced(name: string) {
  return new EmailEventListener(name)
    .on(OrderStateTransitionEvent)
    .filter((event) => event.toState === "ArrangingPayment" && event.fromState === "AddingItems")
    .loadData(async ({ event, injector }) => {
      const entityHydrator = injector.get(EntityHydrator);
      await entityHydrator.hydrate(event.ctx, event.order, {
        relations: ["lines", "customer"],
      });
    })
    .setTemplateVars((event) => ({
      order: event.order,
      adminUrl: env.adminUrl,
      // 1-based numbering keeps the per-product blocks aligned with the
      // "1. termék: …" labels inside the client-generated set-discount summary.
      products: event.order.lines.map((line, index) => ({
        number: index + 1,
        ...line.customFields,
      })),
    }));
}

export const orderConfirmationHandler = onOrderPlaced("quote-order-confirmation")
  .setRecipient((event) => event.order.customer?.emailAddress ?? "")
  .setFrom("{{ fromAddress }}")
  .setSubject("Köszönjük a rendelésed: {{ order.code }}");

export const orderNotificationHandler = onOrderPlaced("quote-order-notification")
  .setRecipient(() => env.shopOwnerEmail)
  .setFrom("{{ fromAddress }}")
  .setSubject("Új árajánlatkérés: {{ order.code }}");
