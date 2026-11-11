import { messages, messageLanguage } from "../../shared/messages";
import type { EmailDetail } from "../../shared/product-definition/index";

export interface EmailViewLine {
  quantity: number;
  discounts: ReadonlyArray<{
    adjustmentSource: string;
    description: string;
    amountWithTax: number;
  }>;
}

export interface EmailViewAddress {
  fullName?: string | null;
  company?: string | null;
  streetLine1?: string | null;
  streetLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

export interface EmailViewOrder {
  currencyCode: string;
  totalWithTax: number;
  lines: readonly EmailViewLine[];
  shippingLines: ReadonlyArray<{
    shippingMethod: { name: string };
    priceWithTax: number;
    discountedPriceWithTax: number;
  }>;
  shippingAddress: EmailViewAddress;
  billingAddress: EmailViewAddress;
  customFields: { taxNumber?: string | null };
}

/** What the order's lines resolve to from their selections, aligned with `order.lines`. */
export interface NativeLineContent {
  title: string;
  details: EmailDetail[];
}

export interface EmailProductView {
  number: number;
  title: string;
  quantity: number;
  details: Array<EmailDetail & { paddingLeft: number; indent: number }> | undefined;
}

export interface EmailBillingView {
  sameAsDelivery: boolean;
  lines: string[];
  taxNumber: string;
}

export interface OrderEmailView {
  products: EmailProductView[];
  deliveryAddress: string[];
  billing: EmailBillingView | undefined;
  deliveryName: string;
  deliveryPrice: string;
  total: string;
  setDiscountSummary: string;
}

export interface EmailMoney {
  currencyCode: string;
  precision: number;
}

export function formatMoney(
  amount: number,
  { currencyCode, precision }: EmailMoney,
  languageCode: string
): string {
  return new Intl.NumberFormat(`${messageLanguage(languageCode)}-HU`, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(amount / 10 ** precision);
}

function indented(details: readonly EmailDetail[]): NonNullable<EmailProductView["details"]> {
  return details.map((detail) => ({
    ...detail,
    paddingLeft: 14 + detail.depth * 14,
    indent: detail.depth * 14,
  }));
}

function filled(values: ReadonlyArray<string | null | undefined>): string[] {
  return values.map((value) => value?.trim() ?? "").filter((value) => value !== "");
}

/** Street and house number, then postcode and city; none when the address has no street. */
export function addressLines(address: EmailViewAddress): string[] {
  const street = filled([address.streetLine1, address.streetLine2]).join(" ");

  if (street === "") {
    return [];
  }

  return filled([street, filled([address.postalCode, address.city]).join(" ")]);
}

/**
 * Who the invoice goes to: the buyer's own billing address when they gave
 * one, otherwise the delivery address with the company stored on it.
 * Undefined when the order holds no billing detail at all.
 */
export function billingView(order: EmailViewOrder): EmailBillingView | undefined {
  const taxNumber = order.customFields.taxNumber?.trim() ?? "";
  const billingLines = addressLines(order.billingAddress);

  if (billingLines.length > 0) {
    return {
      sameAsDelivery: false,
      lines: [
        ...filled([order.billingAddress.fullName, order.billingAddress.company]),
        ...billingLines,
      ],
      taxNumber,
    };
  }

  const sameAsDelivery = addressLines(order.shippingAddress).length > 0;
  const lines = filled([order.shippingAddress.company]);

  if (!sameAsDelivery && lines.length === 0 && taxNumber === "") {
    return undefined;
  }

  return { sameAsDelivery, lines, taxNumber };
}

/** One line per discount that touched the order's lines, naming the products it covers. */
export function setDiscountSummary(
  lines: readonly EmailViewLine[],
  money: EmailMoney,
  languageCode: string
): string {
  const bySource = new Map<string, { description: string; amount: number; numbers: number[] }>();

  for (const [index, line] of lines.entries()) {
    for (const discount of line.discounts) {
      const entry = bySource.get(discount.adjustmentSource) ?? {
        description: discount.description,
        amount: 0,
        numbers: [],
      };

      entry.amount += discount.amountWithTax;
      entry.numbers.push(index + 1);
      bySource.set(discount.adjustmentSource, entry);
    }
  }

  return [...bySource.values()]
    .map(
      (entry) =>
        `${entry.description}: ${formatMoney(entry.amount, money, languageCode)} (${entry.numbers
          .map((number) => messages(languageCode).productOrdinal(number))
          .join(", ")})`
    )
    .join("\n");
}

/**
 * The email's order content (ADR 0013 decision 7): built from the order's
 * lines and shipping line. Orders from the legacy mutation keep their own
 * handlers and templates, built from the stored payload.
 */
export function orderEmailView(
  order: EmailViewOrder,
  nativeLines: readonly NativeLineContent[],
  money: EmailMoney,
  languageCode: string
): OrderEmailView {
  const shipping = order.shippingLines.at(0);
  const freed =
    shipping !== undefined && shipping.priceWithTax > 0 && shipping.discountedPriceWithTax === 0;

  return {
    products: order.lines.map((line, index) => ({
      number: index + 1,
      title: nativeLines[index].title,
      quantity: line.quantity,
      details: indented(nativeLines[index].details),
    })),
    deliveryAddress: addressLines(order.shippingAddress),
    billing: billingView(order),
    deliveryName: shipping?.shippingMethod.name ?? "",
    deliveryPrice: freed
      ? messages(languageCode).deliveryFree()
      : formatMoney(shipping?.discountedPriceWithTax ?? 0, money, languageCode),
    total: formatMoney(order.totalWithTax, money, languageCode),
    setDiscountSummary: setDiscountSummary(order.lines, money, languageCode),
  };
}
