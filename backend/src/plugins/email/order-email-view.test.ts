import { describe, expect, it } from "vitest";
import {
  addressLines,
  billingView,
  formatMoney,
  orderEmailView,
  setDiscountSummary,
  type EmailViewAddress,
  type EmailViewLine,
  type EmailViewOrder,
} from "./order-email-view";

const money = { currencyCode: "HUF", precision: 0 };

const delivery: EmailViewAddress = {
  fullName: "Kovács Béla",
  company: null,
  streetLine1: "Rózsa utca",
  streetLine2: "12.",
  postalCode: "3900",
  city: "Szerencs",
};

/** What Vendure holds for an address that was never set. */
const unset: EmailViewAddress = {
  fullName: null,
  company: null,
  streetLine1: null,
  streetLine2: null,
  postalCode: null,
  city: null,
};

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
    shippingAddress: delivery,
    billingAddress: unset,
    customFields: { taxNumber: null },
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
    expect(view.deliveryAddress).toEqual(["Rózsa utca 12.", "3900 Szerencs"]);
    expect(view.billing).toEqual({ sameAsDelivery: true, lines: [], taxNumber: "" });
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

describe("addressLines", () => {
  it("puts the house number after the street and the postcode before the city", () => {
    expect(addressLines(delivery)).toEqual(["Rózsa utca 12.", "3900 Szerencs"]);
  });

  it("is empty for an address that was never set", () => {
    expect(addressLines(unset)).toEqual([]);
    expect(addressLines({ ...unset, fullName: "Kovács Béla" })).toEqual([]);
  });
});

describe("billingView", () => {
  it("bills the delivery address with its company when the buyer gave no billing address", () => {
    expect(
      billingView(
        order({
          shippingAddress: { ...delivery, company: "Minta Kft." },
          customFields: { taxNumber: "12345678-2-42" },
        })
      )
    ).toEqual({ sameAsDelivery: true, lines: ["Minta Kft."], taxNumber: "12345678-2-42" });
  });

  it("lists the buyer's own billing address with its name and company", () => {
    expect(
      billingView(
        order({
          billingAddress: {
            fullName: "Minta Pénzügy",
            company: "Minta Kft.",
            streetLine1: "Fő u.",
            streetLine2: "1.",
            postalCode: "3894",
            city: "Telkibánya",
          },
          customFields: { taxNumber: "12345678-2-42" },
        })
      )
    ).toEqual({
      sameAsDelivery: false,
      lines: ["Minta Pénzügy", "Minta Kft.", "Fő u. 1.", "3894 Telkibánya"],
      taxNumber: "12345678-2-42",
    });
  });

  it("is undefined when the order holds no billing detail", () => {
    expect(billingView(order({ shippingAddress: unset }))).toBeUndefined();
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
