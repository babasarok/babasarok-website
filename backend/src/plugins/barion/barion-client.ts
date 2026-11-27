export interface BarionAddress {
  fullName: string;
  countryCode: string;
  city: string;
  street: string;
  street2?: string;
  zipCode: string;
}

export interface BarionPayer {
  emailAddress: string;
  fullName: string;
  phone?: string;
  shippingAddress?: BarionAddress;
}

export interface BarionItem {
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

/**
 * One Immediate Payment/Start request for the order's full total, in the
 * Barion's own major-unit decimals (the request builder converts from the
 * stored minor units).
 */
export interface BarionStartPaymentRequest {
  paymentRequestId: string;
  currencyCode: string;
  locale: string;
  total: number;
  payeeEmail: string;
  redirectUrl: string;
  callbackUrl: string;
  items: BarionItem[];
  payer: BarionPayer | null;
}

export interface BarionStartResult {
  paymentId: string;
  gatewayUrl: string;
  status: string;
}

export interface BarionPaymentTransaction {
  transactionId: string;
  total: number;
  type: string | null;
}

export interface BarionPaymentState {
  status: string;
  transactions: BarionPaymentTransaction[];
}

/** Full or partial refund amount against a Succeeded payment. */
export interface BarionRefundRequest {
  paymentId: string;
  total: number;
}

export type BarionOperation = "startPayment" | "getPaymentState" | "refundPayment";

export type BarionFailure =
  | { kind: "rejected"; errors: { code: string; description: string }[] }
  | { kind: "rateLimited" }
  | { kind: "unreachable"; reason: string };

export class BarionError extends Error {
  constructor(
    readonly operation: BarionOperation,
    readonly failure: BarionFailure
  ) {
    super(barionErrorMessage(operation, failure));
    this.name = "BarionError";
  }
}

function barionErrorMessage(operation: BarionError["operation"], failure: BarionFailure): string {
  if (failure.kind === "rejected") {
    const details = failure.errors.map((e) => `${e.code}: ${e.description}`).join("; ");
    return `Barion rejected ${operation} (${details})`;
  }

  if (failure.kind === "rateLimited") {
    return `Barion rate-limited ${operation} (HTTP 429; at most one query per payment per 5 seconds)`;
  }

  return `Barion did not answer ${operation} (${failure.reason})`;
}

/**
 * The gateway surface this slice uses: start an Immediate payment, query its
 * authoritative state (the callback is only a signal), refund a Succeeded
 * payment. Never poll: the 429 rule allows one query per payment per 5 s.
 */
export interface BarionClient {
  startPayment(request: BarionStartPaymentRequest): Promise<BarionStartResult>;
  getPaymentState(paymentId: string): Promise<BarionPaymentState>;
  refundPayment(request: BarionRefundRequest): Promise<void>;
}
