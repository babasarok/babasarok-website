/**
 * The pure Barion decisions: the Barion-status → site-status mapping, the
 * stored-minor-units → Barion-major-units conversion, and the Payment/Start
 * request builder (items, payer hints). No I/O — the service and the tests
 * share these.
 */
import type {
  BarionAddress,
  BarionItem,
  BarionPayer,
  BarionStartPaymentRequest,
} from "./barion-client";

/**
 * The intent's lifecycle on our side. "Processing"/"Succeeded"/"Failed"/
 * "Expired" mirror the gateway's verdicts; "Switched" is local only — the
 * buyer gave up on the gateway payment and switched the order to bank
 * transfer, closing the Barion track (new intents are refused, the pending
 * basket stops rendering). Distinct from Barion's own "Canceled" state,
 * which maps to "Failed".
 */
export type BarionStatus = "Processing" | "Succeeded" | "Failed" | "Expired" | "Switched";

/**
 * Barion's PaymentState verdict. The callback itself is never trusted — this
 * maps the re-queried v4 `Status` value only.
 */
export function barionStatusDecision(barionStatus: string): BarionStatus {
  switch (barionStatus) {
    case "Succeeded":
      return "Succeeded";
    case "Failed":
    case "Canceled":
      return "Failed";
    case "Expired":
      return "Expired";
    default:
      return "Processing";
  }
}

/**
 * Barion amounts are major-unit decimals (HUF: zero decimal digits); Vendure
 * stores integers whose interpretation is defined by the money strategy's
 * precision (whole forints at precision 0). Precision-aware, never
 * HUF-hardcoded: at precision 2 (a future EUR channel) the stored cents
 * divide by 100.
 */
export function toBarionAmount(minorUnits: number, precision: number): number {
  return Number((minorUnits / 10 ** precision).toFixed(precision));
}

export interface BarionOrderSnapshot {
  code: string;
  currencyCode: string;
  languageCode: string;
  totalWithTax: number;
  shippingWithTax: number;
  lines: { name: string; description: string | null; quantity: number; linePriceWithTax: number }[];
  customer: { emailAddress: string; fullName: string; phoneNumber: string | null } | null;
  shippingAddress: BarionAddress | null;
}

const MAX_ITEM_DESCRIPTION_LENGTH = 250;

const SHIPPING_ITEM_NAME = "Szállítás";

const SHIPPING_ITEM_DESCRIPTION = "Kiszállítás a megrendeléshez";

/** Measurement unit on the gateway's item lines (Hungarian: db, otherwise the English pcs). */
function itemUnit(languageCode: string): string {
  return barionLocale(languageCode) === "hu-HU" ? "db" : "pcs";
}

/**
 * The COD deposit's gateway line: a single bare deposit item — the gateway's
 * cardinal rule is what-you-see-is-what-you-pay, so no itemized order
 * context may suggest the items are today's charge (ADR 0021 §2).
 */
export function depositItemName(orderCode: string, languageCode: string): string {
  if (barionLocale(languageCode) === "hu-HU") {
    return `Előleg — Babasarok rendelés #${orderCode}`;
  }

  return `Deposit — Babasarok order #${orderCode}`;
}

/**
 * The deposit payment's request: total = the deposit, items = the one bare
 * deposit line; the payer hints ride along (3DS pass rate), the order's
 * lines and shipping do not.
 */
export function barionDepositStartRequest(
  order: BarionOrderSnapshot,
  deposit: number,
  precision: number,
  options: {
    paymentRequestId: string;
    payeeEmail: string;
    redirectUrl: string;
    callbackUrl: string;
  }
): BarionStartPaymentRequest {
  const total = toBarionAmount(deposit, precision);

  return {
    paymentRequestId: options.paymentRequestId,
    currencyCode: order.currencyCode,
    locale: barionLocale(order.languageCode),
    total,
    payeeEmail: options.payeeEmail,
    redirectUrl: options.redirectUrl,
    callbackUrl: options.callbackUrl,
    items: [
      {
        name: depositItemName(order.code, order.languageCode),
        quantity: 1,
        unit: itemUnit(order.languageCode),
        unitPrice: total,
        total,
      },
    ],
    payer: barionPayer(order),
  };
}

/** Fallback when a variant name is missing: Barion requires a non-empty item name. */
function itemName(name: string, languageCode: string): string {
  const trimmed = name.trim();

  if (trimmed !== "") {
    return trimmed;
  }

  return barionLocale(languageCode) === "hu-HU" ? "Termék" : "Product";
}

/**
 * The gateway shows exactly the Items and Total we send — the items must
 * honestly sum to the transaction total: the order's lines plus a shipping
 * line (Vendure's `totalWithTax = subTotalWithTax + shippingWithTax`, the
 * order-level promotions being already distributed into the lines).
 */
export function barionStartRequest(
  order: BarionOrderSnapshot,
  precision: number,
  options: {
    paymentRequestId: string;
    payeeEmail: string;
    redirectUrl: string;
    callbackUrl: string;
  }
): BarionStartPaymentRequest {
  const items: BarionItem[] = order.lines.map((line) => {
    const total = toBarionAmount(line.linePriceWithTax, precision);

    return {
      name: itemName(line.name, order.languageCode),
      ...(line.description
        ? { description: line.description.slice(0, MAX_ITEM_DESCRIPTION_LENGTH) }
        : {}),
      quantity: line.quantity,
      unit: itemUnit(order.languageCode),
      unitPrice: line.quantity > 0 ? roundTo(total / line.quantity, precision) : total,
      total,
    };
  });

  if (order.shippingWithTax > 0) {
    const shipping = toBarionAmount(order.shippingWithTax, precision);

    items.push({
      name: SHIPPING_ITEM_NAME,
      description: SHIPPING_ITEM_DESCRIPTION,
      quantity: 1,
      unit: itemUnit(order.languageCode),
      unitPrice: shipping,
      total: shipping,
    });
  }

  return {
    paymentRequestId: options.paymentRequestId,
    currencyCode: order.currencyCode,
    locale: barionLocale(order.languageCode),
    total: toBarionAmount(order.totalWithTax, precision),
    payeeEmail: options.payeeEmail,
    redirectUrl: options.redirectUrl,
    callbackUrl: options.callbackUrl,
    items,
    payer: barionPayer(order),
  };
}

function barionPayer(order: BarionOrderSnapshot): BarionPayer | null {
  const customer = order.customer;

  if (!customer) {
    return null;
  }

  const shippingAddress = order.shippingAddress;

  if (!shippingAddress) {
    return {
      emailAddress: customer.emailAddress,
      fullName: customer.fullName,
      ...(customer.phoneNumber ? { phone: barionPhoneNumber(customer.phoneNumber) } : {}),
    };
  }

  return {
    emailAddress: customer.emailAddress,
    fullName: customer.fullName,
    ...(customer.phoneNumber ? { phone: barionPhoneNumber(customer.phoneNumber) } : {}),
    shippingAddress,
  };
}

/** Barion Locale (max 10 chars, `hu-HU`/`en-US` among the accepted values). */
export function barionLocale(languageCode: string): string {
  if (languageCode.toLowerCase().startsWith("hu")) {
    return "hu-HU";
  }

  return "en-US";
}

/**
 * `PayerPhoneNumber` format 36701231234 — digits only, country code first, no
 * `+`, no leading zero (the local `06…` form becomes its international `36…`).
 */
export function barionPhoneNumber(raw: string): string | undefined {
  const digits = raw.replaceAll(/[^\d+]/g, "").replaceAll("+", "");

  if (!/^\d+$/.test(digits)) {
    return undefined;
  }

  if (digits.startsWith("00")) {
    return digits.slice(2) || undefined;
  }

  if (digits.startsWith("06")) {
    return `36${digits.slice(2)}`;
  }

  return digits || undefined;
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;

  return Math.round(value * factor) / factor;
}
