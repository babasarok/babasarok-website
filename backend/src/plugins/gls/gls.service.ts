import { Inject, Injectable, type InjectionToken } from "@nestjs/common";
import {
  Channel,
  EventBus,
  Fulfillment,
  FulfillmentService,
  isGraphQlErrorResult,
  Logger,
  Order,
  OrderService,
  TransactionalConnection,
  type RequestContext,
} from "@vendure/core";
import { In, IsNull } from "typeorm";
import type { OrderLineInput } from "@vendure/common/lib/generated-types";
import { GlsError, type GlsClient, type GlsParcelStatuses } from "./gls-client";
import type { GlsConfig } from "./gls-config";
import {
  glsLabelRequest,
  GLS_HANDLER_CODE,
  outstandingTotal,
  type LabelOrder,
} from "./gls-label-request";
import { GlsParcel } from "./gls-parcel.entity";
import { GlsParcelProblemEvent } from "./gls-parcel-problem-event";
import { glsStatusDecision, RETURNED_CODES, wasHandedOver } from "./gls-status-decision";
import { glsSenderAddress } from "./gls-sender";

export const GLS_CLIENT: InjectionToken<GlsClient> = Symbol("GLS_CLIENT");

export const GLS_MODE: InjectionToken<GlsConfig["mode"]> = Symbol("GLS_MODE");

const LOG_CONTEXT = "GlsService";

const PARCEL_GONE_CODE = 4;

/** "A parcel not yet handed over answers err 26" — the quiet state between creation and hand-over. */
const NOT_YET_HANDED_OVER_CODE = 26;

/** GetParcelListStatuses takes at most 100 parcel numbers per call. */
const STATUS_BATCH_SIZE = 100;

export interface GlsLabelFile {
  fileName: string;
  base64: string;
}

@Injectable()
export class GlsService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly eventBus: EventBus,
    private readonly fulfillmentService: FulfillmentService,
    private readonly orderService: OrderService,
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

  /** Drops the stored label PDF; the GLS record itself stays (reprints go through MyGLS). */
  async dropLabelPdfFor(ctx: RequestContext, fulfillment: Fulfillment): Promise<void> {
    await this.connection
      .getRepository(ctx, GlsParcel)
      .update({ parcelNumber: fulfillment.trackingCode }, { labelPdf: null });
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

  /** The scheduled poll: GLS's status history decides shipped/delivered/problem per open parcel. */
  async pollStatuses(ctx: RequestContext): Promise<void> {
    const parcels = await this.pollableParcels(ctx);

    for (const batch of batches(parcels, STATUS_BATCH_SIZE)) {
      const result = await this.client
        .getParcelStatuses(batch.map((p) => Number(p.parcelNumber)))
        .catch((error: unknown) => {
          Logger.error(`A GLS státusz-lekérdezés nem sikerült: ${errorText(error)}`, LOG_CONTEXT);
          return null;
        });

      if (!result) {
        continue;
      }

      for (const error of result.errors.filter((e) => e.code !== NOT_YET_HANDED_OVER_CODE)) {
        Logger.warn(
          `A GLS státusz-lekérdezés hibát adott: ${error.code}: ${error.description} (${error.parcelIds.join(", ")})`,
          LOG_CONTEXT
        );
      }

      const errored = new Set(result.errors.flatMap((e) => e.parcelIds));

      for (const parcel of batch) {
        if (errored.has(parcel.parcelId)) {
          continue;
        }

        const wire = result.parcels.find((p) => p.parcelNumber === Number(parcel.parcelNumber));

        if (wire) {
          await this.applyStatusAction(ctx, parcel, wire);
        }
      }
    }
  }

  private async pollableParcels(ctx: RequestContext): Promise<GlsParcel[]> {
    const parcels = await this.connection
      .getRepository(ctx, GlsParcel)
      .find({ where: { mode: this.mode, deletedInGlsAt: IsNull() } });

    if (parcels.length === 0) {
      return parcels;
    }

    const fulfillments = await this.connection
      .getRepository(ctx, Fulfillment)
      .find({ where: { trackingCode: In(parcels.map((p) => p.parcelNumber)) } });
    const byCode = new Map(fulfillments.map((f) => [f.trackingCode, f]));

    return parcels.filter((parcel) => {
      const state = byCode.get(parcel.parcelNumber)?.state;

      if (state === undefined) {
        Logger.warn(
          `A(z) ${parcel.parcelNumber} GLS-csomaghoz nem található teljesítés — nem pollolható.`,
          LOG_CONTEXT
        );
        return false;
      }

      return state !== "Delivered" && state !== "Cancelled";
    });
  }

  private async applyStatusAction(
    ctx: RequestContext,
    parcel: GlsParcel,
    wire: GlsParcelStatuses
  ): Promise<void> {
    const fulfillment = await this.connection
      .getRepository(ctx, Fulfillment)
      .findOne({ where: { trackingCode: parcel.parcelNumber } });

    if (!fulfillment) {
      Logger.warn(
        `A(z) ${parcel.parcelNumber} GLS-csomaghoz nem található teljesítés.`,
        LOG_CONTEXT
      );
      return;
    }

    const action = glsStatusDecision(wire.statuses);

    if (action.kind === "none") {
      return;
    }

    if (action.kind === "shipped") {
      if (fulfillment.state === "Pending") {
        await this.transition(ctx, parcel, fulfillment, "Shipped");
      }

      return;
    }

    // A handed-over parcel reflects on the fulfillment even when a problem
    // status is also in the history — the buyer email depends on the Shipped
    // transition. A delivered parcel needs no "it's on its way".
    if (
      action.kind !== "delivered" &&
      fulfillment.state === "Pending" &&
      wasHandedOver(wire.statuses)
    ) {
      await this.transition(ctx, parcel, fulfillment, "Shipped");
    }

    if (action.kind === "delivered") {
      if (fulfillment.state === "Delivered") {
        return;
      }

      if (!(await this.paymentsCoverTotal(ctx, parcel))) {
        // Utánvét: the cash is collected in person — the order holds in Shipped
        // until the owner records the payment (no email; GLS's refusal path
        // never reaches "delivered", so this is only a recorded-payment lag).
        Logger.info(
          `A(z) ${parcel.parcelNumber} GLS-csomag kézbesítve, de a(z) ${parcel.orderId} rendelés kifizetetlen — Shipped-ben marad.`,
          LOG_CONTEXT
        );
        return;
      }

      await this.transition(ctx, parcel, fulfillment, "Delivered");
      await this.dropLabelPdfFor(ctx, fulfillment);

      return;
    }

    if (action.status.code === parcel.problemNotifiedCode) {
      return;
    }

    const order = await this.connection
      .getRepository(ctx, Order)
      .findOne({ where: { id: parcel.orderId } });

    if (!order) {
      Logger.warn(
        `A(z) ${parcel.parcelNumber} GLS-csomag rendelése (${parcel.orderId}) nem található.`,
        LOG_CONTEXT
      );
      return;
    }

    // A parcel returned to sender (23/40) is the automatic `Returned` flag —
    // the state entry is the flag; the owner's exits (cancel or re-fulfill)
    // are manual, no auto-cancel (ADR 0021 §4).
    if (RETURNED_CODES.has(action.status.code) && order.state === "Shipped") {
      const transition = await this.orderService.transitionToState(ctx, order.id, "Returned");

      if (isGraphQlErrorResult(transition)) {
        Logger.warn(
          `A(z) ${order.code} rendelés nem mozdítható Returned-ba: ${transition.message}`,
          LOG_CONTEXT
        );
      }
    }

    await this.connection
      .getRepository(ctx, GlsParcel)
      .update(
        { id: parcel.id },
        { problemNotifiedCode: action.status.code, problemNotifiedAt: new Date() }
      );

    await this.eventBus.publish(
      new GlsParcelProblemEvent(
        ctx,
        String(parcel.orderId),
        order.code,
        parcel.parcelNumber,
        action.status.code,
        action.status.description
      )
    );

    await this.orderService.addNoteToOrder(ctx, {
      id: parcel.orderId,
      isPublic: false,
      note: `GLS ${action.status.code}: ${action.status.description || "problémás állapot"} — a(z) ${parcel.parcelNumber} csomag. Részletek a MyGLS-ben.`,
    });
  }

  private async transition(
    ctx: RequestContext,
    parcel: GlsParcel,
    fulfillment: Fulfillment,
    state: "Shipped" | "Delivered"
  ): Promise<void> {
    const result = await this.fulfillmentService.transitionToState(ctx, fulfillment.id, state);

    if (isGraphQlErrorResult(result)) {
      Logger.error(
        `A(z) ${parcel.parcelNumber} GLS-csomag teljesítése nem állítható ${state} állapotba: ${result.message}`,
        LOG_CONTEXT
      );
    }
  }

  private async paymentsCoverTotal(ctx: RequestContext, parcel: GlsParcel): Promise<boolean> {
    const order = await this.connection
      .getRepository(ctx, Order)
      .findOne({ where: { id: parcel.orderId }, relations: { payments: true } });

    if (!order) {
      Logger.warn(
        `A(z) ${parcel.parcelNumber} GLS-csomag rendelése (${parcel.orderId}) nem található.`,
        LOG_CONTEXT
      );
      return false;
    }

    return (
      outstandingTotal({
        totalWithTax: order.totalWithTax,
        payments: order.payments.map((p) => ({ state: p.state, amount: p.amount })),
      }) <= 0
    );
  }
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }

  return result;
}

function errorText(error: unknown): string {
  if (error instanceof GlsError) {
    return error.message;
  }

  return String(error);
}

function labelOrder(order: Order): LabelOrder {
  return {
    code: order.code,
    currencyCode: order.currencyCode,
    totalWithTax: order.totalWithTax,
    state: order.state,
    deposit: order.shippingLines[0]?.shippingMethod?.customFields?.deposit ?? 0,
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
