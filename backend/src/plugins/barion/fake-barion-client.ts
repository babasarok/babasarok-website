import {
  BarionError,
  type BarionClient,
  type BarionPaymentState,
  type BarionPaymentTransaction,
  type BarionRefundRequest,
  type BarionStartPaymentRequest,
  type BarionStartResult,
} from "./barion-client";

/**
 * The fake's seam: production state changes arrive from Barion's callback +
 * a PaymentState re-query; tests drive them directly.
 */
export class FakeBarionClient implements BarionClient {
  private readonly payments = new Map<string, BarionStartPaymentRequest>();
  private readonly states = new Map<string, BarionPaymentState>();
  private readonly refunds: BarionRefundRequest[] = [];
  private nextIndex = 0;

  constructor(private readonly gatewayBase = "https://secure.test.barion.com") {}

  get refundRequests(): readonly BarionRefundRequest[] {
    return [...this.refunds];
  }

  requestsFor(paymentRequestIdPrefix: string): BarionStartPaymentRequest[] {
    return [...this.payments.values()].filter((request) =>
      request.paymentRequestId.startsWith(paymentRequestIdPrefix)
    );
  }

  setStatus(
    paymentId: string,
    status: string,
    transactions: BarionPaymentTransaction[] = []
  ): void {
    this.states.set(paymentId, { status, transactions });
  }

  async startPayment(request: BarionStartPaymentRequest): Promise<BarionStartResult> {
    const paymentId = `fake-payment-${this.nextIndex++}`;
    this.payments.set(paymentId, request);
    this.states.set(paymentId, { status: "Started", transactions: [] });

    return {
      paymentId,
      gatewayUrl: `${this.gatewayBase}/Gateway/Payment?t=${paymentId}`,
      status: "Started",
    };
  }

  async getPaymentState(paymentId: string): Promise<BarionPaymentState> {
    const state = this.states.get(paymentId);

    if (!state) {
      throw new BarionError("getPaymentState", {
        kind: "rejected",
        errors: [{ code: "PaymentNotFound", description: "Payment does not exist." }],
      });
    }

    return state;
  }

  async refundPayment(request: BarionRefundRequest): Promise<void> {
    const state = this.states.get(request.paymentId);

    if (!state || state.status !== "Succeeded") {
      throw new BarionError("refundPayment", {
        kind: "rejected",
        errors: [
          {
            code: "PaymentStatusNotValid",
            description: "Only Succeeded payments can be refunded.",
          },
        ],
      });
    }

    this.refunds.push(request);
  }
}
