import { z } from "zod";
import {
  BarionError,
  type BarionClient,
  type BarionPaymentState,
  type BarionRefundRequest,
  type BarionStartPaymentRequest,
  type BarionStartResult,
} from "./barion-client";

export interface BarionApiClientOptions {
  mode: "test" | "live";
  posKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const ErrorInfoSchema = z.object({
  errorCode: z.string(),
  description: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
});

const ErrorListSchema = z
  .array(ErrorInfoSchema)
  .nullish()
  .transform((list) =>
    (list ?? []).map((error) => ({ code: error.errorCode, description: error.description }))
  );

const StartResponseSchema = z.object({
  paymentId: z.string().min(1),
  gatewayUrl: z.string().min(1),
  status: z.string().min(1),
});

const PaymentTransactionSchema = z.object({
  transactionId: z.string(),
  total: z.number(),
  type: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
});

const PaymentStateResponseSchema = z.object({
  status: z.string().min(1),
  transactions: z
    .array(PaymentTransactionSchema)
    .nullish()
    .transform((list) => list ?? []),
});

const RefundResponseSchema = z.looseObject({});

export function barionApiBase(mode: "test" | "live"): string {
  return mode === "test" ? "https://api.test.barion.com" : "https://api.barion.com";
}

export function createBarionApiClient(options: BarionApiClientOptions): BarionClient {
  const baseUrl = barionApiBase(options.mode);
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<S extends z.ZodType>(
    operation: BarionError["operation"],
    path: string,
    init: RequestInit,
    schema: S
  ): Promise<z.output<S>> {
    let response: Response;

    try {
      response = await doFetch(baseUrl + path, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new BarionError(operation, { kind: "unreachable", reason: errorText(error) });
    }

    if (response.status === 429) {
      throw new BarionError(operation, { kind: "rateLimited" });
    }

    let json: unknown;

    try {
      json = await response.json();
    } catch (error) {
      throw new BarionError(operation, { kind: "unreachable", reason: errorText(error) });
    }

    // Barion's responses are PascalCase; the schemas read camelCase.
    const normalized = decapitalizeKeys(json);

    if (!response.ok) {
      const parsed = ErrorListSchema.safeParse((normalized as { errors?: unknown }).errors);

      throw new BarionError(
        operation,
        parsed.success && parsed.data.length > 0
          ? { kind: "rejected", errors: parsed.data }
          : { kind: "unreachable", reason: `HTTP ${response.status}` }
      );
    }

    const parsed = schema.safeParse(normalized);

    if (!parsed.success) {
      throw new BarionError(operation, {
        kind: "unreachable",
        reason: `unexpected ${path} response: ${parsed.error.message}`,
      });
    }

    return parsed.data;
  }

  return {
    async startPayment(request: BarionStartPaymentRequest): Promise<BarionStartResult> {
      return call(
        "startPayment",
        "/v2/Payment/Start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(startBody(request, options.posKey)),
        },
        StartResponseSchema
      );
    },

    async getPaymentState(paymentId: string): Promise<BarionPaymentState> {
      // v4 authenticates with a header, not a body POSKey; the path is the
      // payment's GUID. At most one call per callback (the 429 rule).
      return call(
        "getPaymentState",
        `/v4/payment/${paymentId}/paymentstate`,
        {
          method: "GET",
          headers: { "x-pos-key": options.posKey },
        },
        PaymentStateResponseSchema
      );
    },

    async refundPayment(request: BarionRefundRequest): Promise<void> {
      const state = await this.getPaymentState(request.paymentId);
      const refundable = state.transactions.filter((transaction) => isRefundable(transaction.type));
      const lines = allocateRefund(request.total, refundable);

      await call(
        "refundPayment",
        "/v2/Payment/Refund",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            POSKey: options.posKey,
            PaymentId: request.paymentId,
            TransactionsToRefund: lines.map((line) => ({
              TransactionId: line.transactionId,
              Total: line.total,
            })),
          }),
        },
        RefundResponseSchema
      );
    },
  };
}

interface WireStartRequest {
  POSKey: string;
  PaymentType: "Immediate";
  GuestCheckOut: true;
  FundingSources: ["Balance", "BankCard", "GooglePay", "ApplePay"];
  PaymentRequestId: string;
  Currency: string;
  Locale: string;
  Total: number;
  RedirectUrl: string;
  CallbackUrl: string;
  Transactions: [
    {
      POSTransactionId: string;
      Payee: string;
      Total: number;
      Items: {
        Name: string;
        Description?: string;
        Quantity: number;
        UnitPrice: number;
        Total: number;
      }[];
    },
  ];
  PayerHint?: string;
  CardHolderNameHint?: string;
  PayerPhoneNumber?: string;
  ShippingAddress?: {
    FullName: string;
    Country: string;
    City: string;
    Street: string;
    Street2?: string;
    Zip: string;
  };
}

function startBody(request: BarionStartPaymentRequest, posKey: string): WireStartRequest {
  const wire: WireStartRequest = {
    POSKey: posKey,
    PaymentType: "Immediate",
    GuestCheckOut: true,
    FundingSources: ["Balance", "BankCard", "GooglePay", "ApplePay"],
    PaymentRequestId: request.paymentRequestId,
    Currency: request.currencyCode,
    Locale: request.locale,
    Total: request.total,
    RedirectUrl: request.redirectUrl,
    CallbackUrl: request.callbackUrl,
    Transactions: [
      {
        POSTransactionId: request.paymentRequestId,
        Payee: request.payeeEmail,
        Total: request.total,
        Items: request.items.map((item) => ({
          Name: item.name,
          ...(item.description === undefined ? {} : { Description: item.description }),
          Quantity: item.quantity,
          UnitPrice: item.unitPrice,
          Total: item.total,
        })),
      },
    ],
  };

  if (!request.payer) {
    return wire;
  }

  return {
    ...wire,
    PayerHint: request.payer.emailAddress,
    CardHolderNameHint: request.payer.fullName.slice(0, 45),
    ...(request.payer.phone ? { PayerPhoneNumber: request.payer.phone } : {}),
    ...(request.payer.shippingAddress
      ? {
          ShippingAddress: {
            FullName: request.payer.shippingAddress.fullName,
            Country: request.payer.shippingAddress.countryCode,
            City: request.payer.shippingAddress.city,
            Street: request.payer.shippingAddress.street,
            ...(request.payer.shippingAddress.street2
              ? { Street2: request.payer.shippingAddress.street2 }
              : {}),
            Zip: request.payer.shippingAddress.zipCode,
          },
        }
      : {}),
  };
}

const REFUNDABLE_TYPES = new Set(["CardPayment", "Shop", "BankTransferPayment"]);

function isRefundable(type: string | null): boolean {
  return type === null || REFUNDABLE_TYPES.has(type);
}

/** Splits the refund amount across the payment's transactions (per-transaction refunds). */
function allocateRefund(
  total: number,
  transactions: { transactionId: string; total: number; type: string | null }[]
): { transactionId: string; total: number }[] {
  let remaining = total;
  const lines: { transactionId: string; total: number }[] = [];

  for (const transaction of transactions) {
    if (remaining <= 0) {
      break;
    }

    const amount = Math.min(remaining, transaction.total);

    lines.push({ transactionId: transaction.transactionId, total: amount });
    remaining -= amount;
  }

  return lines;
}

/** Barion's PascalCase keys read as camelCase after lowercasing the first letter. */
function decapitalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decapitalizeKeys);
  }

  if (value instanceof Object) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key.charAt(0).toLowerCase() + key.slice(1),
        decapitalizeKeys(entry),
      ])
    );
  }

  return value;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
