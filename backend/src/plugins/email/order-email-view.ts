import type { EmailDetail } from "./selection-details";

export interface EmailViewLine {
  quantity: number;
  discounts: ReadonlyArray<{
    adjustmentSource: string;
    description: string;
    amountWithTax: number;
  }>;
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

export interface OrderEmailView {
  products: EmailProductView[];
  deliveryName: string;
  deliveryPrice: string;
  total: string;
  setDiscountSummary: string;
}

export interface EmailMoney {
  currencyCode: string;
  precision: number;
}

export function formatMoney(amount: number, { currencyCode, precision }: EmailMoney): string {
  return new Intl.NumberFormat("hu-HU", {
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

/** One line per discount that touched the order's lines, naming the products it covers. */
export function setDiscountSummary(lines: readonly EmailViewLine[], money: EmailMoney): string {
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
        `${entry.description}: ${formatMoney(entry.amount, money)} (${entry.numbers
          .map((number) => `${number}. termék`)
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
  money: EmailMoney
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
    deliveryName: shipping?.shippingMethod.name ?? "",
    deliveryPrice: freed ? "ingyenes" : formatMoney(shipping?.discountedPriceWithTax ?? 0, money),
    total: formatMoney(order.totalWithTax, money),
    setDiscountSummary: setDiscountSummary(order.lines, money),
  };
}
