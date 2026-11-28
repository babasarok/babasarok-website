import type { GlsAddress, GlsParcelRequest } from "./gls-client";

export const GLS_PREPAID_METHOD_CODE = "gls-elore-utalas";

export const GLS_CASH_ON_DELIVERY_METHOD_CODE = "gls-utanvet";

export const GLS_HANDLER_CODE = "gls";

const COVERING_PAYMENT_STATES = new Set(["Authorized", "Settled"]);

export interface LabelAddress {
  fullName?: string | null;
  streetLine1?: string | null;
  streetLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  phoneNumber?: string | null;
}

export interface LabelOrder {
  code: string;
  currencyCode: string;
  totalWithTax: number;
  state: string;
  shippingMethodCode: string | undefined;
  /** The variant's arrangement deposit (0 = full prepay) — ADR 0021 §1. */
  deposit: number;
  shippingAddress: LabelAddress;
  customerEmail: string | undefined;
  customerPhone: string | undefined;
  payments: readonly { state: string; amount: number }[];
  lines: readonly { id: string; quantity: number }[];
  fulfillments: readonly { handlerCode: string; state: string }[];
}

export interface RequestedLine {
  orderLineId: string;
  quantity: number;
}

export type LabelRequestResult =
  { ok: true; request: GlsParcelRequest } | { ok: false; reason: string };

/**
 * One GLS parcel per order: the label covers every line of the order, and a
 * second label is refused while a non-cancelled one exists (GLS itself
 * creates a new parcel on every request).
 */
export function glsLabelRequest(
  order: LabelOrder,
  requestedLines: readonly RequestedLine[],
  sender: GlsAddress
): LabelRequestResult {
  const method = order.shippingMethodCode;

  if (method !== GLS_PREPAID_METHOD_CODE && method !== GLS_CASH_ON_DELIVERY_METHOD_CODE) {
    return {
      ok: false,
      reason: `A(z) ${order.code} rendelés nem GLS-szállítású (${method ?? "nincs szállítási mód"}), ezért nem készülhet hozzá GLS-címke.`,
    };
  }

  if (
    order.fulfillments.some((f) => f.handlerCode === GLS_HANDLER_CODE && f.state !== "Cancelled")
  ) {
    return {
      ok: false,
      reason: `A(z) ${order.code} rendeléshez már készült GLS-címke. Új címke előtt sztornózd a meglévő teljesítést.`,
    };
  }

  if (!coversEveryLine(order.lines, requestedLines)) {
    return {
      ok: false,
      reason: `A GLS-címke a(z) ${order.code} rendelés összes tételét egy csomagban adja fel: a teljesítésbe minden tétel teljes mennyiségét vedd fel.`,
    };
  }

  const delivery = deliveryAddress(order);

  if (!delivery.ok) {
    return {
      ok: false,
      reason: `A(z) ${order.code} rendelés szállítási címéből hiányzik: ${delivery.missing.join(", ")}.`,
    };
  }

  const request: GlsParcelRequest = {
    clientReference: order.code,
    content: order.code,
    pickupAddress: sender,
    deliveryAddress: delivery.address,
  };

  if (method !== GLS_CASH_ON_DELIVERY_METHOD_CODE) {
    return { ok: true, request };
  }

  // The deferred variant's promise is deposit-now, rest-at-handover: before
  // the deposit is recorded (the order rests in `ArrangingPayment`) the label
  // would collect the deposit too — refuse instead (ADR 0021 §4).
  if (order.deposit > 0 && order.state === "ArrangingPayment") {
    return {
      ok: false,
      reason: `A(z) ${order.code} utánvéti rendelés ${order.deposit} Ft előlege még nincs rögzítve — a címke csak a rögzített előleg után készülhet, különben a futár az előleget is beszedné.`,
    };
  }

  const outstanding = outstandingTotal(order);

  if (outstanding <= 0) {
    return { ok: true, request };
  }

  return {
    ok: true,
    request: {
      ...request,
      cashOnDelivery: { amount: outstanding, reference: order.code, currency: order.currencyCode },
    },
  };
}

export function splitHouseNumber(value: string): {
  houseNumber?: string;
  houseNumberInfo?: string;
} {
  const trimmed = value.trim();
  const match = /^(\d+)\s*(.*)$/.exec(trimmed);

  if (trimmed === "") {
    return {};
  }

  if (!match || Number(match[1]) === 0) {
    return { houseNumberInfo: trimmed };
  }

  const rest = match[2].replace(/^[.\s]+/, "").trim();

  if (rest === "") {
    return { houseNumber: match[1] };
  }

  return { houseNumber: match[1], houseNumberInfo: rest };
}

function coversEveryLine(
  lines: LabelOrder["lines"],
  requestedLines: readonly RequestedLine[]
): boolean {
  const requested = new Map<string, number>();

  for (const line of requestedLines) {
    requested.set(line.orderLineId, (requested.get(line.orderLineId) ?? 0) + line.quantity);
  }

  return lines.every((line) => line.quantity === 0 || requested.get(line.id) === line.quantity);
}

function coveredAmount(payments: LabelOrder["payments"]): number {
  return payments
    .filter((p) => COVERING_PAYMENT_STATES.has(p.state))
    .reduce((sum, p) => sum + p.amount, 0);
}

/** The part of the order's gross total not covered by authorized/settled payments. */
export function outstandingTotal(order: Pick<LabelOrder, "totalWithTax" | "payments">): number {
  return order.totalWithTax - coveredAmount(order.payments);
}

type DeliveryAddressResult = { ok: true; address: GlsAddress } | { ok: false; missing: string[] };

function deliveryAddress(order: LabelOrder): DeliveryAddressResult {
  const a = order.shippingAddress;
  const name = text(a.fullName);
  const street = text(a.streetLine1);
  const city = text(a.city);
  const zipCode = text(a.postalCode);
  const countryCode = text(a.countryCode);

  if (
    name === undefined ||
    street === undefined ||
    city === undefined ||
    zipCode === undefined ||
    countryCode === undefined
  ) {
    const labelled: [string, string | undefined][] = [
      ["név", name],
      ["utca", street],
      ["település", city],
      ["irányítószám", zipCode],
      ["ország", countryCode],
    ];

    return {
      ok: false,
      missing: labelled.filter(([, value]) => value === undefined).map(([label]) => label),
    };
  }

  return {
    ok: true,
    address: {
      name,
      street,
      ...splitHouseNumber(a.streetLine2 ?? ""),
      city,
      zipCode,
      countryCode: countryCode.toUpperCase(),
      contactName: name,
      contactPhone: text(a.phoneNumber) ?? text(order.customerPhone),
      contactEmail: text(order.customerEmail),
    },
  };
}

function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}
