import {
  ConfigService,
  EntityHydrator,
  OrderStateTransitionEvent,
  TransactionalConnection,
} from "@vendure/core";
import { Channel } from "@vendure/core/dist/entity/channel/channel.entity";
import {
  EmailEventListener,
  type EmailEventHandler,
  type EventWithAsyncData,
} from "@vendure/email-plugin";
import { env } from "../../env";
import { isLegacyQuoteOrder } from "../quote-order/legacy-order";
import { parseProductDetails } from "../quote-order/quote-order.input";
import { plainDeliveryName } from "./delivery-name";
import { loadNativeLineContent } from "./native-line-content";
import { orderEmailView, type OrderEmailView } from "./order-email-view";

// "Order placed" for a quote shop: the submission transitions AddingItems ->
// ArrangingPayment and there is no payment step.
function onOrderPlaced(
  name: string
): EmailEventHandler<
  string,
  EventWithAsyncData<OrderStateTransitionEvent, { orderEmailFrom: string; ownerEmail: string }>
> {
  return new EmailEventListener(name)
    .on(OrderStateTransitionEvent)
    .filter(
      (event) =>
        event.toState === "ArrangingPayment" &&
        event.fromState === "AddingItems" &&
        isLegacyQuoteOrder(event.order)
    )
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
        // No `select`: TypeORM ignores an embedded selected as `true`
        // (selects none of its columns), which silently emptied customFields.
        .findOne({ where: { id: event.ctx.channelId } });
      return {
        orderEmailFrom: channel?.customFields.orderEmailFrom ?? env.orderEmailFrom,
        ownerEmail: channel?.customFields.shopOwnerEmail ?? env.shopOwnerEmail,
      };
    })
    .setTemplateVars((event) => ({
      order: event.order,
      fromAddress: event.data.orderEmailFrom,
      // Deep link to the order itself; ADMIN_URL is per-stack (previews get
      // their own host provisioned at first deploy), so one env var serves
      // every stack correctly.
      adminOrderUrl: `${env.adminUrl.replace(/\/$/, "")}/orders/${event.order.id}`,
      deliveryMethodName: plainDeliveryName(event.order.customFields.deliveryMethodName ?? ""),
      // 1-based numbering keeps the per-product blocks aligned with the
      // "1. termék: …" labels inside the client-generated set-discount summary.
      products: event.order.lines.map((line, index) => ({
        number: index + 1,
        // eslint-disable-next-line @typescript-eslint/no-misused-spread -- customFields is a plain column bag at runtime; its class typing is a Vendure artifact
        ...line.customFields,
        quantity: line.quantity,
        details: parseProductDetails(line.customFields.detailsJson)?.map((d) => ({
          ...d,
          paddingLeft: 14 + d.depth * 14,
          indent: d.depth * 14,
        })),
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

function onNativeOrderPlaced(
  name: string
): EmailEventHandler<
  string,
  EventWithAsyncData<
    OrderStateTransitionEvent,
    { orderEmailFrom: string; ownerEmail: string; view: OrderEmailView }
  >
> {
  return new EmailEventListener(name)
    .on(OrderStateTransitionEvent)
    .filter(
      (event) =>
        event.toState === "ArrangingPayment" &&
        event.fromState === "AddingItems" &&
        !isLegacyQuoteOrder(event.order)
    )
    .loadData(async ({ event, injector }) => {
      await injector.get(EntityHydrator).hydrate(event.ctx, event.order, {
        relations: [
          "lines",
          "lines.productVariant",
          "customer",
          "shippingLines",
          "shippingLines.shippingMethod",
        ],
      });

      const connection = injector.get(TransactionalConnection);
      const channel = await connection
        .getRepository(event.ctx, Channel)
        .findOne({ where: { id: event.ctx.channelId } });
      const view = orderEmailView(
        event.order,
        await loadNativeLineContent(connection, event.ctx, event.order),
        {
          currencyCode: event.order.currencyCode,
          precision: injector.get(ConfigService).entityOptions.moneyStrategy.precision ?? 2,
        }
      );

      return {
        view,
        orderEmailFrom: channel?.customFields.orderEmailFrom ?? env.orderEmailFrom,
        ownerEmail: channel?.customFields.shopOwnerEmail ?? env.shopOwnerEmail,
      };
    })
    .setTemplateVars((event) => ({
      order: event.order,
      fromAddress: event.data.orderEmailFrom,
      adminOrderUrl: `${env.adminUrl.replace(/\/$/, "")}/orders/${event.order.id}`,
      ...event.data.view,
    }));
}

export const nativeOrderConfirmationHandler = onNativeOrderPlaced("order-confirmation")
  .setRecipient((event) => event.order.customer?.emailAddress ?? "")
  .setFrom("{{ fromAddress }}")
  .setSubject("Köszönjük a rendelésed: {{ order.code }}");

export const nativeOrderNotificationHandler = onNativeOrderPlaced("order-notification")
  .setRecipient((event) => event.data.ownerEmail)
  .setFrom("{{ fromAddress }}")
  .setSubject("Új árajánlatkérés: {{ order.code }}");
