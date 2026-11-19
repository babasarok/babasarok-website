import { Inject, Injectable } from "@nestjs/common";
import {
  Channel,
  Fulfillment,
  Logger,
  Order,
  TransactionalConnection,
  type RequestContext,
} from "@vendure/core";
import type { OrderLineInput } from "@vendure/common/lib/generated-types";
import { GlsError, type GlsClient } from "./gls-client";
import type { GlsConfig } from "./gls-config";
import { glsLabelRequest, GLS_HANDLER_CODE, type LabelOrder } from "./gls-label-request";
import { GlsParcel } from "./gls-parcel.entity";
import { glsSenderAddress } from "./gls-sender";

export const GLS_CLIENT = Symbol("GLS_CLIENT");

export const GLS_MODE = Symbol("GLS_MODE");

const LOG_CONTEXT = "GlsService";

const PARCEL_GONE_CODE = 4;

export interface GlsLabelFile {
  fileName: string;
  base64: string;
}

@Injectable()
export class GlsService {
  constructor(
    private readonly connection: TransactionalConnection,
    @Inject(GLS_CLIENT) private readonly client: GlsClient,
    @Inject(GLS_MODE) private readonly mode: GlsConfig["mode"]
  ) {}

  async createLabel(
    ctx: RequestContext,
    orders: readonly Order[],
    lines: readonly OrderLineInput[]
  ): Promise<{ method: string; trackingCode: string }> {
    if (orders.length !== 1) {
      throw new Error("Egy GLS-címke pontosan egy rendelés tételeit tartalmazhatja.");
    }

    const order = await this.connection.getRepository(ctx, Order).findOne({
      where: { id: orders[0].id },
      relations: {
        lines: true,
        payments: true,
        customer: true,
        fulfillments: true,
        shippingLines: { shippingMethod: true },
      },
    });

    if (!order) {
      throw new Error(`Nincs rendelés ezzel az azonosítóval: ${orders[0].id}`);
    }

    const channel = await this.connection
      .getRepository(ctx, Channel)
      .findOne({ where: { id: ctx.channelId } });

    const sender = glsSenderAddress(channel?.customFields.glsSender);

    if (!sender.ok) {
      throw new Error(sender.reason);
    }

    const decision = glsLabelRequest(
      labelOrder(order),
      lines.map((l) => ({ orderLineId: String(l.orderLineId), quantity: l.quantity })),
      sender.address
    );

    if (!decision.ok) {
      throw new Error(decision.reason);
    }

    const label = await this.client.createLabel(decision.request).catch((error: unknown) => {
      throw new Error(createFailureText(error, order.code), { cause: error });
    });

    try {
      await this.connection.getRepository(ctx, GlsParcel).save(
        new GlsParcel({
          orderId: order.id,
          parcelId: label.parcelId,
          parcelNumber: String(label.parcelNumber),
          mode: this.mode,
          labelPdf: Buffer.from(label.pdf),
          deletedInGlsAt: null,
        })
      );
    } catch (error) {
      await this.client.deleteLabel(label.parcelId).catch((deleteError: unknown) => {
        Logger.error(
          `GLS parcel ${label.parcelNumber} (order ${order.code}) was created but could not be stored or deleted: ${String(deleteError)}`,
          LOG_CONTEXT
        );
      });

      throw error;
    }

    return { method: "GLS", trackingCode: String(label.parcelNumber) };
  }

  /** Deletes the fulfillment's parcel in GLS; a returned text blocks the cancellation. */
  async deleteLabelFor(ctx: RequestContext, fulfillment: Fulfillment): Promise<string | undefined> {
    const parcel = await this.connection
      .getRepository(ctx, GlsParcel)
      .findOne({ where: { parcelNumber: fulfillment.trackingCode } });

    if (!parcel || parcel.deletedInGlsAt) {
      return undefined;
    }

    if (parcel.mode !== this.mode) {
      return `A(z) ${parcel.parcelNumber} GLS-csomag „${parcel.mode}” módban készült, ez a kiszolgáló „${this.mode}” módban fut — itt nem törölhető.`;
    }

    try {
      await this.client.deleteLabel(parcel.parcelId);
    } catch (error) {
      if (!isParcelGone(error)) {
        return `A GLS nem törölte a(z) ${parcel.parcelNumber} csomagot (${glsFailureText(error)}), ezért a teljesítés nem sztornózható. Ha a csomagot már átadtad a futárnak, a GLS-nél intézd.`;
      }
    }

    await this.connection
      .getRepository(ctx, GlsParcel)
      .update({ id: parcel.id }, { deletedInGlsAt: new Date(), labelPdf: null });

    return undefined;
  }

  async labelFile(ctx: RequestContext, fulfillmentId: string): Promise<GlsLabelFile | undefined> {
    const fulfillment = await this.connection
      .getRepository(ctx, Fulfillment)
      .findOne({ where: { id: fulfillmentId, handlerCode: GLS_HANDLER_CODE } });

    if (!fulfillment) {
      return undefined;
    }

    const parcel = await this.connection
      .getRepository(ctx, GlsParcel)
      .createQueryBuilder("parcel")
      .addSelect("parcel.labelPdf")
      .where("parcel.parcelNumber = :parcelNumber", { parcelNumber: fulfillment.trackingCode })
      .getOne();

    if (!parcel?.labelPdf) {
      return undefined;
    }

    return {
      fileName: `gls-${parcel.parcelNumber}.pdf`,
      base64: parcel.labelPdf.toString("base64"),
    };
  }
}

function labelOrder(order: Order): LabelOrder {
  return {
    code: order.code,
    currencyCode: order.currencyCode,
    totalWithTax: order.totalWithTax,
    shippingMethodCode: order.shippingLines[0]?.shippingMethod?.code,
    shippingAddress: order.shippingAddress,
    customerEmail: order.customer?.emailAddress,
    customerPhone: order.customer?.phoneNumber,
    payments: order.payments.map((p) => ({ state: p.state, amount: p.amount })),
    lines: order.lines.map((l) => ({ id: String(l.id), quantity: l.quantity })),
    fulfillments: order.fulfillments.map((f) => ({ handlerCode: f.handlerCode, state: f.state })),
  };
}

function isParcelGone(error: unknown): boolean {
  return (
    error instanceof GlsError &&
    error.failure.kind === "rejected" &&
    error.failure.errors.every((e) => e.code === PARCEL_GONE_CODE)
  );
}

function glsFailureText(error: unknown): string {
  if (!(error instanceof GlsError)) {
    return String(error);
  }

  if (error.failure.kind === "rejected") {
    return error.failure.errors.map((e) => `${e.code}: ${e.description}`).join("; ");
  }

  return `nem válaszolt: ${error.failure.reason}`;
}

function createFailureText(error: unknown, orderCode: string): string {
  if (error instanceof GlsError && error.failure.kind === "unreachable") {
    return `A GLS nem válaszolt a címkekérésre (${error.failure.reason}). Lehet, hogy a csomag mégis létrejött: mielőtt újra próbálod, keresd meg a MyGLS-ben a(z) ${orderCode} hivatkozással.`;
  }

  return `A GLS nem hozta létre a címkét: ${glsFailureText(error)}`;
}
