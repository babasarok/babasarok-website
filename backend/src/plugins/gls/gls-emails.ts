import {
  FulfillmentStateTransitionEvent,
  LanguageCode,
  Order,
  TransactionalConnection,
} from "@vendure/core";
import { EmailEventListener } from "@vendure/email-plugin";
import { env } from "../../env";
import { messages } from "../../shared/messages";
import { loadNativeLineContent } from "../email/native-line-content";
import { loadChannelEmails } from "../email/order-emails";
import { emailProducts } from "../email/order-email-view";
import { GLS_HANDLER_CODE } from "./gls-label-request";
import { GlsParcel } from "./gls-parcel.entity";
import { GlsParcelProblemEvent } from "./gls-parcel-problem-event";

/** The GLS parcel's public tracking page (verified 2026-11-21; GLS serves it in English only). */
export function glsTrackingUrl(parcelNumber: string): string {
  return `https://gls-group.eu/HU/en/parcel-tracking?match=${parcelNumber}`;
}

/**
 * The buyer learns the parcel is on its way. The order does not record the
 * language the buyer used at checkout, so the email goes out in Hungarian
 * (the site's default); the English variant exists for the template loader.
 */
export const glsShippedHandler = new EmailEventListener("gls-shipped")
  .on(FulfillmentStateTransitionEvent)
  .filter(
    (event) => event.toState === "Shipped" && event.fulfillment.handlerCode === GLS_HANDLER_CODE
  )
  .loadData(async ({ event, injector }) => {
    const connection = injector.get(TransactionalConnection);
    const parcel = await connection
      .getRepository(event.ctx, GlsParcel)
      .findOne({ where: { parcelNumber: event.fulfillment.trackingCode } });

    if (!parcel) {
      throw new Error(
        `No GLS parcel row for tracking code ${event.fulfillment.trackingCode} — the gls-shipped email is skipped`
      );
    }

    const order = await connection.getRepository(event.ctx, Order).findOne({
      where: { id: parcel.orderId },
      relations: { customer: true, lines: { productVariant: { product: true } } },
    });

    if (!order) {
      throw new Error(`No order ${parcel.orderId} for GLS parcel ${parcel.parcelNumber}`);
    }

    return {
      orderCode: order.code,
      buyerEmail: order.customer?.emailAddress ?? "",
      subject: messages(LanguageCode.hu).glsShippedSubject(order.code),
      parcelNumber: parcel.parcelNumber,
      products: emailProducts(order, await loadNativeLineContent(connection, event.ctx, order)),
      ...(await loadChannelEmails(connection, event.ctx)),
    };
  })
  .setRecipient((event) => event.data.buyerEmail)
  .setFrom("{{ fromAddress }}")
  .setSubject("{{ subject }}")
  .setTemplateVars((event) => ({
    orderCode: event.data.orderCode,
    parcelNumber: event.data.parcelNumber,
    trackingUrl: glsTrackingUrl(event.data.parcelNumber),
    products: event.data.products,
    subject: event.data.subject,
    fromAddress: event.data.orderEmailFrom,
  }));

export const glsProblemHandler = new EmailEventListener("gls-parcel-problem")
  .on(GlsParcelProblemEvent)
  .loadData(async ({ event, injector }) => ({
    subject: messages(LanguageCode.hu).glsProblemSubject(event.orderCode),
    adminOrderUrl: `${env.adminUrl.replace(/\/$/, "")}/orders/${event.orderId}`,
    ...(await loadChannelEmails(injector.get(TransactionalConnection), event.ctx)),
  }))
  .setRecipient((event) => event.data.ownerEmail)
  .setFrom("{{ fromAddress }}")
  .setSubject("{{ subject }}")
  .setTemplateVars((event) => ({
    orderCode: event.orderCode,
    parcelNumber: event.parcelNumber,
    statusCode: event.statusCode,
    statusDescription: event.statusDescription,
    subject: event.data.subject,
    fromAddress: event.data.orderEmailFrom,
    adminOrderUrl: event.data.adminOrderUrl,
  }));
