import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import {
  ChannelService,
  ConfigService,
  isGraphQlErrorResult,
  JobQueueService,
  LanguageCode,
  Logger,
  Order,
  OrderService,
  PaymentMethod,
  PaymentMethodService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  UserInputError,
} from "@vendure/core";
import type { JobQueue } from "@vendure/core";
import { z } from "zod";
import { encodeRefusal } from "../../shared/refusal";
import { BarionError, type BarionClient } from "./barion-client";
import { barionCallbackUrl, barionRedirectUrl, type BarionConfig } from "./barion-config";
import {
  barionStartRequest,
  barionStatusDecision,
  type BarionOrderSnapshot,
  type BarionStatus,
} from "./barion-payment-items";
import { BarionPayment } from "./barion-payment.entity";
import { BARION_PAYMENT_METHOD_CODE, BarionPaymentMetadataSchema } from "./barion.handler";

export const BARION_CLIENT: symbol = Symbol("BARION_CLIENT");

export const BARION_CONFIG: symbol = Symbol("BARION_CONFIG");

const LOG_CONTEXT = "BarionService";

const CALLBACK_QUEUE_NAME = "barion-callback";

const CALLBACK_JOB_DATA_SCHEMA = z.object({ paymentId: z.string().min(1).max(100) });

/** A callback is only ever a pointer: validate the id, never trust a status. */
const CALLBACK_PAYMENT_ID_SCHEMA = z.string().trim().min(1).max(100);

const SEED_LOCK_KEY = 5_130_002;

@Injectable()
export class BarionService implements OnApplicationBootstrap {
  private callbackQueue: JobQueue<{ paymentId: string }> | null = null;

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly orderService: OrderService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly jobQueueService: JobQueueService,
    private readonly requestContextService: RequestContextService,
    private readonly channelService: ChannelService,
    private readonly configService: ConfigService,
    @Inject(BARION_CLIENT) private readonly client: BarionClient,
    @Inject(BARION_CONFIG) private readonly config: BarionConfig
  ) {}

  /** One queue, concurrency 1: the same payment's callbacks run strictly in order. */
  async onApplicationBootstrap(): Promise<void> {
    this.callbackQueue = await this.jobQueueService.createQueue({
      name: CALLBACK_QUEUE_NAME,
      process: async (job) => {
        await this.processCallback(CALLBACK_JOB_DATA_SCHEMA.parse(job.data));
      },
    });

    await this.seedPaymentMethod();
  }

  /**
   * Starts an Immediate Barion payment for the session's placed order's full
   * total and returns the gateway URL. Refusals travel as coded refusals: the
   * site owns the wording.
   */
  async createPaymentIntent(
    ctx: RequestContext
  ): Promise<{ paymentId: string; gatewayUrl: string }> {
    const activeOrderId = ctx.session?.activeOrderId;

    if (!activeOrderId) {
      throw barionOrderState();
    }

    const order = await this.connection.getRepository(ctx, Order).findOne({
      where: { id: activeOrderId },
      relations: {
        lines: { productVariant: true },
        customer: true,
        payments: true,
      },
    });

    if (!order || order.active || order.state !== "ArrangingPayment" || coveredByPayments(order)) {
      throw barionOrderState();
    }

    const attempt = await this.connection
      .getRepository(ctx, BarionPayment)
      .count({ where: { orderId: order.id } });

    // Unique per attempt: a retried payment after a failure gets its own id.
    const request = barionStartRequest(
      orderSnapshot(order, ctx.languageCode),
      this.moneyPrecision(),
      {
        paymentRequestId: `${order.code}-${attempt + 1}`,
        payeeEmail: this.payeeEmail(),
        redirectUrl: barionRedirectUrl(this.config.redirectBase, order.code),
        callbackUrl: barionCallbackUrl(this.config.callbackBase),
      }
    );

    const started = await this.client.startPayment(request).catch((error: unknown) => {
      Logger.error(
        `A(z) ${order.code} rendelés Barion fizetésindítása meghiúsult: ${errorText(error)}`,
        LOG_CONTEXT
      );
      throw barionIntentFailed();
    });

    await this.connection.getRepository(ctx, BarionPayment).save(
      new BarionPayment({
        paymentId: started.paymentId,
        orderId: order.id,
        orderCode: order.code,
        sessionId: String(ctx.session.id),
        status: "Processing",
        role: "full",
        amount: order.totalWithTax,
        currencyCode: order.currencyCode,
      })
    );

    return { paymentId: started.paymentId, gatewayUrl: started.gatewayUrl };
  }

  /**
   * The confirmation page's poll: our DB only (never a Barion re-query per
   * poll — the 429 rule), and only for the session that created the intent or
   * the order's own registered buyer.
   */
  async paymentStatus(
    ctx: RequestContext,
    orderCode: string
  ): Promise<{ paymentId: string | null; status: BarionStatus }> {
    const order = await this.connection.getRepository(ctx, Order).findOne({
      where: { code: orderCode },
      relations: { customer: { user: true }, payments: true },
    });

    if (!order) {
      return { paymentId: null, status: "Processing" };
    }

    const row = await this.connection
      .getRepository(ctx, BarionPayment)
      .findOne({ where: { orderId: order.id }, order: { id: "DESC" } });

    if (!row || !accessible(ctx, order, row)) {
      return { paymentId: null, status: "Processing" };
    }

    return { paymentId: row.paymentId, status: row.status };
  }

  /** The controller's fast path: validate, enqueue, answer — inside the 15 s budget. */
  async acceptCallback(paymentIdRaw: string | undefined): Promise<void> {
    const parsed = CALLBACK_PAYMENT_ID_SCHEMA.safeParse(paymentIdRaw);

    if (!parsed.success) {
      return;
    }

    const row = await this.connection.rawConnection.getRepository(BarionPayment).findOne({
      where: { paymentId: parsed.data },
    });

    // An unknown id resolves to nothing: the callback signal is not trusted, only used.
    if (!row) {
      Logger.warn(`Barion callback unknown paymentId (${parsed.data}).`, LOG_CONTEXT);
      return;
    }

    if (!this.callbackQueue) {
      throw new Error("A Barion callback sor még nem áll rendelkezésre.");
    }

    // A failed job is retried by the queue; a 429-failed re-query must not be lost.
    await this.callbackQueue.add({ paymentId: parsed.data }, { retries: 2 });
  }

  /**
   * One re-query per callback, branching on the authoritative PaymentState:
   * Succeeded records the payment through the admin-ctx handler path (the
   * Mollie pattern); Failed/Expired mark the row, no payment.
   */
  private async processCallback({ paymentId }: { paymentId: string }): Promise<void> {
    const row = await this.connection.rawConnection
      .getRepository(BarionPayment)
      .findOne({ where: { paymentId } });

    if (!row) {
      return;
    }

    if (row.status !== "Processing") {
      return;
    }

    let state: Awaited<ReturnType<BarionClient["getPaymentState"]>>;

    try {
      state = await this.client.getPaymentState(paymentId);
    } catch (error: unknown) {
      if (error instanceof BarionError && error.failure.kind === "rateLimited") {
        throw error;
      }

      Logger.error(
        `A(z) ${paymentId} Barion fizetés állapota nem kérdezhető le: ${errorText(error)}`,
        LOG_CONTEXT
      );
      return;
    }

    const decision = barionStatusDecision(state.status);

    if (decision === "Processing") {
      return;
    }

    if (decision !== "Succeeded") {
      Logger.warn(
        `A(z) ${row.orderCode} rendelés Barion fizetése ${decision} lett (${paymentId}).`,
        LOG_CONTEXT
      );
      await this.updateStatus(paymentId, decision);
      return;
    }

    await this.recordSucceededPayment(row, state);
  }

  private async recordSucceededPayment(
    row: BarionPayment,
    state: Awaited<ReturnType<BarionClient["getPaymentState"]>>
  ): Promise<void> {
    const ctx = await this.jobContext();

    await this.connection.withTransaction(ctx, async (txCtx) => {
      const order = await this.connection
        .getRepository(txCtx, Order)
        .findOne({ where: { id: row.orderId }, relations: { payments: true } });

      if (!order) {
        Logger.error(
          `A(z) ${row.orderCode} Barion-fizetéses rendelés eltűnt (${String(row.orderId)}).`,
          LOG_CONTEXT
        );
        return;
      }

      if (coveredByPayments(order)) {
        // A double callback (or a race) never records twice.
        await this.updateStatus(row.paymentId, "Succeeded");
        return;
      }

      if (order.state !== "ArrangingPayment") {
        Logger.error(
          `A(z) ${row.orderCode} rendelés nem ArrangingPayment állapotban van (${order.state}) — a Barion fizetés nem rögzíthető.`,
          LOG_CONTEXT
        );
        return;
      }

      const result = await this.orderService.addPaymentToOrder(txCtx, order.id, {
        method: BARION_PAYMENT_METHOD_CODE,
        metadata: BarionPaymentMetadataSchema.parse({
          role: "full",
          barionPaymentId: row.paymentId,
          amount: row.amount,
          currencyCode: row.currencyCode,
          barionStatus: state.status,
        }),
      });

      if (isGraphQlErrorResult(result)) {
        throw new Error(
          `A(z) ${row.orderCode} rendelés Barion fizetésének rögzítése meghiúsult: ${result.message}`
        );
      }

      await this.connection
        .getRepository(txCtx, BarionPayment)
        .update({ paymentId: row.paymentId }, { status: "Succeeded" });
    });
  }

  private async updateStatus(paymentId: string, status: BarionStatus): Promise<void> {
    await this.connection.rawConnection
      .getRepository(BarionPayment)
      .update({ paymentId }, { status });
  }

  private payeeEmail(): string {
    if (this.config.mode === "fake") {
      return "bolt@babasarok.test";
    }

    return this.config.payeeEmail;
  }

  /** Stored minor units (whole forints at precision 0) → Barion major-unit decimals. */
  private moneyPrecision(): number {
    return this.configService.entityOptions.moneyStrategy.precision ?? 0;
  }

  private async jobContext(): Promise<RequestContext> {
    const defaultChannel = await this.channelService.getDefaultChannel();

    return this.requestContextService.create({ apiType: "admin", channelOrToken: defaultChannel });
  }

  /**
   * Create-if-missing, never overwritten (the delivery-seed pattern): the
   * owner edits the method in the dashboard afterwards. No eligibility
   * checker — the default says eligible.
   */
  private async seedPaymentMethod(): Promise<void> {
    const runner = this.connection.rawConnection.createQueryRunner();

    await runner.connect();
    await runner.query("select pg_advisory_lock($1)", [SEED_LOCK_KEY]);

    try {
      const ctx = await this.requestContextService.create({ apiType: "admin" });
      const existing = await this.connection
        .getRepository(ctx, PaymentMethod)
        .findOne({ where: { code: BARION_PAYMENT_METHOD_CODE }, withDeleted: true });

      if (existing !== null) {
        return;
      }

      await this.paymentMethodService.create(ctx, {
        code: BARION_PAYMENT_METHOD_CODE,
        enabled: true,
        handler: { code: BARION_PAYMENT_METHOD_CODE, arguments: [] },
        translations: [
          {
            languageCode: LanguageCode.hu,
            name: "Barion fizetés",
            description: "Bankkártyás fizetés a Barion Smart Gatewayen",
          },
        ],
      });
    } finally {
      await runner.query("select pg_advisory_unlock($1)", [SEED_LOCK_KEY]);
      await runner.release();
    }
  }
}

function barionOrderState(): UserInputError {
  return new UserInputError(encodeRefusal({ code: "BARION_ORDER_STATE" }));
}

function barionIntentFailed(): UserInputError {
  return new UserInputError(encodeRefusal({ code: "BARION_INTENT_FAILED" }));
}

/** Vendure's coverage rule: Error/Declined/Cancelled payments do not count. */
function coveredByPayments(order: Order): boolean {
  const covered = order.payments
    .filter(
      (payment) =>
        payment.state !== "Error" && payment.state !== "Declined" && payment.state !== "Cancelled"
    )
    .reduce((sum, payment) => sum + payment.amount, 0);

  return covered >= order.totalWithTax;
}

/**
 * The intent's own session (the confirmation page's session) or the order's
 * registered buyer. Nobody else's order code resolves to anything.
 */
function accessible(ctx: RequestContext, order: Order, row: BarionPayment): boolean {
  if (String(ctx.session?.id ?? "") === row.sessionId) {
    return true;
  }

  const ownerUserId = order.customer?.user?.id;

  return (
    ownerUserId !== undefined &&
    ctx.activeUserId !== undefined &&
    String(ownerUserId) === String(ctx.activeUserId)
  );
}

function orderSnapshot(order: Order, languageCode: string): BarionOrderSnapshot {
  const customer = order.customer;
  const fullName = customer ? `${customer.lastName} ${customer.firstName}`.trim() : "";
  const shippingAddress = order.shippingAddress;

  return {
    code: order.code,
    currencyCode: order.currencyCode,
    languageCode,
    totalWithTax: order.totalWithTax,
    shippingWithTax: order.shippingWithTax,
    lines: order.lines.map((line) => ({
      name: line.productVariant.name,
      description: line.customFields.configText ?? null,
      quantity: line.quantity,
      linePriceWithTax: line.linePriceWithTax,
    })),
    customer: customer
      ? {
          emailAddress: customer.emailAddress,
          fullName,
          phoneNumber: customer.phoneNumber,
        }
      : null,
    shippingAddress: {
      fullName: shippingAddress.company || fullName,
      countryCode: shippingAddress.countryCode ?? "",
      city: shippingAddress.city ?? "",
      street: shippingAddress.streetLine1 ?? "",
      ...(shippingAddress.streetLine2 ? { street2: shippingAddress.streetLine2 } : {}),
      zipCode: shippingAddress.postalCode ?? "",
    },
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
