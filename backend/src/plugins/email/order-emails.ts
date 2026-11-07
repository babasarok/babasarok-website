import {
  ConfigService,
  EntityHydrator,
  type Order,
  OrderStateTransitionEvent,
  type RequestContext,
  TransactionalConnection,
} from "@vendure/core";
import { Channel } from "@vendure/core/dist/entity/channel/channel.entity";
import {
  EmailEventListener,
  type EmailEventHandler,
  type EventWithAsyncData,
} from "@vendure/email-plugin";
import { env } from "../../env";
import { isLegacyQuoteOrder } from "../../shared/legacy-order";
import { messages } from "../../shared/messages";
import { loadNativeLineContent } from "./native-line-content";
import { orderEmailView, type OrderEmailView } from "./order-email-view";

// Channel-level email config, editable in the dashboard's channel settings;
// fall back to the env values while unset.
async function loadChannelEmails(
  connection: TransactionalConnection,
  ctx: RequestContext
): Promise<{ orderEmailFrom: string; ownerEmail: string }> {
  const channel = await connection
    .getRepository(ctx, Channel)
    // No `select`: TypeORM ignores an embedded selected as `true`
    // (selects none of its columns), which silently emptied customFields.
    .findOne({ where: { id: ctx.channelId } });

  return {
    orderEmailFrom: channel?.customFields.orderEmailFrom ?? env.orderEmailFrom,
    ownerEmail: channel?.customFields.shopOwnerEmail ?? env.shopOwnerEmail,
  };
}

// Deep link to the order itself; ADMIN_URL is per-stack (previews get
// their own host provisioned at first deploy), so one env var serves
// every stack correctly.
function adminOrderUrl(order: Order): string {
  return `${env.adminUrl.replace(/\/$/, "")}/orders/${order.id}`;
}

function onNativeOrderPlaced(
  name: string,
  subject: (event: OrderStateTransitionEvent) => string
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
      const view = orderEmailView(
        event.order,
        await loadNativeLineContent(connection, event.ctx, event.order),
        {
          currencyCode: event.order.currencyCode,
          precision: injector.get(ConfigService).entityOptions.moneyStrategy.precision ?? 2,
        },
        event.ctx.languageCode
      );

      return {
        view,
        ...(await loadChannelEmails(connection, event.ctx)),
      };
    })
    .setTemplateVars((event) => ({
      order: event.order,
      fromAddress: event.data.orderEmailFrom,
      adminOrderUrl: adminOrderUrl(event.order),
      subject: subject(event),
      ...event.data.view,
    }));
}

export const nativeOrderConfirmationHandler = onNativeOrderPlaced("order-confirmation", (event) =>
  messages(event.ctx.languageCode).orderConfirmationSubject(event.order.code)
)
  .setRecipient((event) => event.order.customer?.emailAddress ?? "")
  .setFrom("{{ fromAddress }}")
  .setSubject("{{ subject }}");

export const nativeOrderNotificationHandler = onNativeOrderPlaced("order-notification", (event) =>
  messages(event.ctx.languageCode).orderNotificationSubject(event.order.code)
)
  .setRecipient((event) => event.data.ownerEmail)
  .setFrom("{{ fromAddress }}")
  .setSubject("{{ subject }}");
