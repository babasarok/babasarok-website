import { Injectable } from "@nestjs/common";
import {
  EntityHydrator,
  ID,
  isGraphQlErrorResult,
  Logger,
  Order,
  OrderService,
  PaymentService,
  RequestContext,
  TransactionalConnection,
} from "@vendure/core";
import { paymentArrangement } from "../../shared/arrangement";

const LOG_CONTEXT = "OrderLifecycleService";

/**
 * The owner's deposit recording and fulfillment-start flag (ADR 0021 §4).
 * The 6 000 Ft deposit can never enter through the dashboard's manual
 * payment action (it always records the exact deficit), so the deposit has
 * this explicit handler path — the same recording path the Számlázz.hu IPN
 * will automate in slice 4.
 */
@Injectable()
export class OrderLifecycleService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly entityHydrator: EntityHydrator
  ) {}

  /**
   * Records the variant's deposit as a settled bank-transfer payment and
   * moves the order out of the un-shippable `ArrangingPayment` into
   * `DepositPaid`. The order-state path is payment-method-agnostic: a
   * deposit recorded here behaves exactly like one recorded from the
   * Barion callback.
   */
  async recordDepositPayment(
    ctx: RequestContext,
    orderId: ID,
    transactionId?: string
  ): Promise<Order> {
    const order = await this.connection.getRepository(ctx, Order).findOne({
      where: { id: orderId },
      relations: { payments: true, shippingLines: { shippingMethod: true } },
    });

    if (!order) {
      throw new Error(`A(z) ${String(orderId)} azonosítójú rendelés nem található.`);
    }

    const arrangement = paymentArrangement(order);

    if (arrangement.kind !== "deposit") {
      throw new Error(
        `A(z) ${order.code} rendelés szállítási módja nem jár előleggel (teljes előre fizetés) — nincs mit rögzíteni.`
      );
    }

    if (order.state !== "ArrangingPayment") {
      throw new Error(
        `A(z) ${order.code} rendelés állapota ${order.state} — az előleg csak az ArrangingPayment állapotban rögzíthető.`
      );
    }

    await this.paymentService.createManualPayment(ctx, order, arrangement.deposit, {
      orderId: order.id,
      method: "bank-transfer",
      transactionId: transactionId ?? undefined,
      metadata: { role: "deposit" },
    });

    const transition = await this.orderService.transitionToState(ctx, order.id, "DepositPaid");

    if (isGraphQlErrorResult(transition)) {
      throw new Error(
        `A(z) ${order.code} rendelés előlege rögzült, de nem mozdítható DepositPaid-ba: ${transition.message}`
      );
    }

    Logger.info(`A(z) ${order.code} rendelés előlege rögzítve, DepositPaid.`, LOG_CONTEXT);

    return transition;
  }

  /**
   * The owner starts making the product (production + shipping — her
   * definition; Vendure fulfillments mean shipping only). The first call
   * stamps the time; later calls are no-ops.
   */
  async markFulfillmentStarted(ctx: RequestContext, orderId: ID): Promise<Order> {
    // The Order entity's computed properties (discounts, taxSummary) throw on
    // an unjoined entity: TypeORM's save touches them, so the relations ride
    // along.
    const order = await this.connection.getRepository(ctx, Order).findOne({
      where: { id: orderId },
      relations: { lines: true, surcharges: true },
    });

    if (!order) {
      throw new Error(`A(z) ${String(orderId)} azonosítójú rendelés nem található.`);
    }

    if (order.customFields.fulfillmentStartedAt !== null) {
      return order;
    }

    order.customFields.fulfillmentStartedAt = new Date();

    await this.connection.getRepository(ctx, Order).save(order);

    Logger.info(`A(z) ${order.code} rendelés gyártása elindítva.`, LOG_CONTEXT);

    // The admin Order type's discounts read the lines: the returned entity
    // must carry the relation.
    await this.entityHydrator.hydrate(ctx, order, { relations: ["lines"] });

    return order;
  }
}
