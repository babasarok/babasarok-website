import {
  ConfigService,
  EntityHydrator,
  type Injector,
  LanguageCode,
  Order,
  OrderStateTransitionEvent,
  type RequestContext,
  RequestContextService,
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

async function contextIn(
  injector: Injector,
  ctx: RequestContext,
  languageCode: LanguageCode
): Promise<RequestContext> {
  if (ctx.languageCode === languageCode) {
    return ctx;
  }

  return injector.get(RequestContextService).create({
    apiType: ctx.apiType,
    channelOrToken: ctx.channel,
    languageCode,
  });
}

interface NativeOrderEmail {
  /** The language the email's content is written in. */
  languageCode: (event: OrderStateTransitionEvent) => LanguageCode;
  subject: (orderCode: string, languageCode: LanguageCode) => string;
}

/**
 * Each email loads its own copy of the order: translating the event's shared
 * order into one email's language would leak into the other email.
 */
function onNativeOrderPlaced(
  name: string,
  email: NativeOrderEmail
): EmailEventHandler<
  string,
  EventWithAsyncData<
    OrderStateTransitionEvent,
    {
      order: Order;
      subject: string;
      orderEmailFrom: string;
      ownerEmail: string;
      view: OrderEmailView;
    }
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
      const languageCode = email.languageCode(event);
      const ctx = await contextIn(injector, event.ctx, languageCode);
      const connection = injector.get(TransactionalConnection);
      const order = await connection
        .getRepository(ctx, Order)
        .findOneOrFail({ where: { id: event.order.id } });

      await injector.get(EntityHydrator).hydrate(ctx, order, {
        relations: [
          "lines",
          "lines.productVariant",
          "customer",
          "shippingLines",
          "shippingLines.shippingMethod",
          // The email job serializes the order, and its taxSummary getter needs these.
          "surcharges",
        ],
      });

      const view = orderEmailView(
        order,
        await loadNativeLineContent(connection, ctx, order),
        {
          currencyCode: order.currencyCode,
          precision: injector.get(ConfigService).entityOptions.moneyStrategy.precision ?? 2,
        },
        languageCode
      );

      return {
        order,
        subject: email.subject(order.code, languageCode),
        view,
        ...(await loadChannelEmails(connection, ctx)),
      };
    })
    .setTemplateVars((event) => ({
      order: event.data.order,
      fromAddress: event.data.orderEmailFrom,
      adminOrderUrl: adminOrderUrl(event.data.order),
      subject: event.data.subject,
      ...event.data.view,
    }));
}

export const nativeOrderConfirmationHandler = onNativeOrderPlaced("order-confirmation", {
  languageCode: (event) => event.ctx.languageCode,
  subject: (orderCode, languageCode) => messages(languageCode).orderConfirmationSubject(orderCode),
})
  .setRecipient((event) => event.order.customer?.emailAddress ?? "")
  .setFrom("{{ fromAddress }}")
  .setSubject("{{ subject }}");

/** The owner reads every order in Hungarian, whatever language the buyer used. */
export const nativeOrderNotificationHandler = onNativeOrderPlaced("order-notification", {
  languageCode: () => LanguageCode.hu,
  subject: (orderCode, languageCode) => messages(languageCode).orderNotificationSubject(orderCode),
})
  .setRecipient((event) => event.data.ownerEmail)
  .setFrom("{{ fromAddress }}")
  .setSubject("{{ subject }}");
