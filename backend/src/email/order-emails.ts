import { EntityHydrator, OrderStateTransitionEvent, TransactionalConnection } from "@vendure/core";
import { Channel } from "@vendure/core/dist/entity/channel/channel.entity";
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
      // Channel-level email config, editable in the dashboard's channel
      // settings; fall back to the env values while unset.
      const channel = await injector
        .get(TransactionalConnection)
        .getRepository(event.ctx, Channel)
        .findOne({
          select: { id: true, customFields: true },
          where: { id: event.ctx.channelId },
        });
      return {
        orderEmailFrom:
          (channel?.customFields.orderEmailFrom as string | null) ?? env.orderEmailFrom,
        ownerEmail: (channel?.customFields.shopOwnerEmail as string | null) ?? env.shopOwnerEmail,
      };
    })
    .setTemplateVars((event) => ({
      order: event.order,
      fromAddress: event.data.orderEmailFrom,
      // Deep link to the order itself; ADMIN_URL is per-stack (previews get
      // their own host provisioned at first deploy), so one env var serves
      // every stack correctly.
      adminOrderUrl: `${env.adminUrl}orders/${event.order.id}`,
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
  .setRecipient((event) => event.data.ownerEmail)
  .setFrom("{{ fromAddress }}")
  .setSubject("Új árajánlatkérés: {{ order.code }}");
