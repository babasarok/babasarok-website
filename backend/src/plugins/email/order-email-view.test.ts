import { describe, expect, it } from "vitest";
import {
  formatMoney,
  orderEmailView,
  setDiscountSummary,
  type EmailViewLine,
  type EmailViewOrder,
} from "./order-email-view";

const money = { currencyCode: "HUF", precision: 0 };

const setDiscount = {
  adjustmentSource: "promo:1",
  description: "Szett kedvezmény",
  amountWithTax: -1500,
};

function line(overrides: Partial<EmailViewLine> = {}): EmailViewLine {
  return { quantity: 2, discounts: [], ...overrides };
}

function order(overrides: Partial<EmailViewOrder> = {}): EmailViewOrder {
  return {
    currencyCode: "HUF",
    totalWithTax: 20_500,
    lines: [line({ discounts: [setDiscount] }), line({ discounts: [setDiscount] })],
    shippingLines: [
      {
        shippingMethod: { name: "GLS házhozszállítás előre utalással" },
        priceWithTax: 2500,
        discountedPriceWithTax: 2500,
      },
    ],
    ...overrides,
  };
}

const content = [
  { title: "Párna", details: [{ label: "Méret", value: "Nagy", depth: 0 }] },
  { title: "Takaró", details: [{ label: "Felirat", value: "Bence", depth: 1 }] },
];

describe("orderEmailView", () => {
  it("builds products and total from the order's lines, not a client payload", () => {
    const view = orderEmailView(order(), content, money, "hu");

    expect(view.products.map((product) => [product.number, product.title])).toEqual([
      [1, "Párna"],
      [2, "Takaró"],
    ]);
    expect(view.products[1].details).toEqual([
      { label: "Felirat", value: "Bence", depth: 1, paddingLeft: 28, indent: 14 },
    ]);
    expect(view.total).toBe(formatMoney(20_500, money, "hu"));
    expect(view.deliveryName).toBe("GLS házhozszállítás előre utalással");
    expect(view.deliveryPrice).toBe(formatMoney(2500, money, "hu"));
  });

  it("shows a promotion-zeroed charged delivery as free", () => {
    const view = orderEmailView(
      order({
        shippingLines: [
          { shippingMethod: { name: "GLS" }, priceWithTax: 2500, discountedPriceWithTax: 0 },
        ],
      }),
      content,
      money,
      "hu"
    );

    expect(view.deliveryPrice).toBe("ingyenes");
  });

  it("charges nothing for a delivery that was never priced", () => {
    const view = orderEmailView(
      order({
        shippingLines: [
          { shippingMethod: { name: "Személyes" }, priceWithTax: 0, discountedPriceWithTax: 0 },
        ],
      }),
      content,
      money,
      "hu"
    );

    expect(view.deliveryPrice).toBe(formatMoney(0, money, "hu"));
  });

  it("renders the delivery price per language", () => {
    const view = orderEmailView(
      order({
        shippingLines: [
          { shippingMethod: { name: "GLS" }, priceWithTax: 2500, discountedPriceWithTax: 0 },
        ],
      }),
      content,
      money,
      "en"
    );

    expect(view.deliveryPrice).toBe("free");
  });
});

describe("setDiscountSummary", () => {
  it("names the products each discount covers", () => {
    expect(setDiscountSummary(order().lines, money, "hu")).toBe(
      `Szett kedvezmény: ${formatMoney(-3000, money, "hu")} (1. termék, 2. termék)`
    );
  });

  it("is empty without discounts", () => {
    expect(setDiscountSummary([line()], money, "hu")).toBe("");
  });

  it("names the products in the request language", () => {
    expect(setDiscountSummary(order().lines, money, "en")).toBe(
      `Szett kedvezmény: ${formatMoney(-3000, money, "en")} (product 1, product 2)`
    );
  });
});
