import { describe, expect, it } from "vitest";
import type { GlsAddress } from "./gls-client";
import {
  glsLabelRequest,
  splitHouseNumber,
  type LabelOrder,
  type LabelRequestResult,
} from "./gls-label-request";

const sender: GlsAddress = {
  name: "Babasarok",
  street: "Fő utca",
  houseNumber: "1",
  city: "Telkibánya",
  zipCode: "3896",
  countryCode: "HU",
};

function order(overrides: Partial<LabelOrder> = {}): LabelOrder {
  return {
    code: "ORD-1",
    currencyCode: "HUF",
    totalWithTax: 21_000,
    shippingMethodCode: "gls-elore-utalas",
    shippingAddress: {
      fullName: "Teszt Címzett",
      streetLine1: "Váci utca",
      streetLine2: "10",
      city: "Budapest",
      postalCode: "1052",
      countryCode: "hu",
      phoneNumber: "+36301234567",
    },
    customerEmail: "cimzett@example.com",
    customerPhone: undefined,
    payments: [{ state: "Settled", amount: 21_000 }],
    lines: [
      { id: "1", quantity: 2 },
      { id: "2", quantity: 1 },
    ],
    fulfillments: [],
    ...overrides,
  };
}

function refusal(result: LabelRequestResult): string {
  if (result.ok) {
    throw new Error("expected a refusal");
  }

  return result.reason;
}

const everyLine = [
  { orderLineId: "1", quantity: 2 },
  { orderLineId: "2", quantity: 1 },
];

describe("glsLabelRequest", () => {
  it("builds a prepaid parcel referenced by the order code, with the buyer as contact", () => {
    expect(glsLabelRequest(order(), everyLine, sender)).toEqual({
      ok: true,
      request: {
        clientReference: "ORD-1",
        content: "ORD-1",
        pickupAddress: sender,
        deliveryAddress: {
          name: "Teszt Címzett",
          street: "Váci utca",
          houseNumber: "10",
          city: "Budapest",
          zipCode: "1052",
          countryCode: "HU",
          contactName: "Teszt Címzett",
          contactPhone: "+36301234567",
          contactEmail: "cimzett@example.com",
        },
      },
    });
  });

  it("collects the outstanding total on a utánvét parcel", () => {
    const result = glsLabelRequest(
      order({
        shippingMethodCode: "gls-utanvet",
        payments: [
          { state: "Settled", amount: 6000 },
          { state: "Declined", amount: 15_000 },
        ],
      }),
      everyLine,
      sender
    );

    expect(result).toMatchObject({
      ok: true,
      request: { cashOnDelivery: { amount: 15_000, reference: "ORD-1", currency: "HUF" } },
    });
  });

  it("collects nothing on a fully paid utánvét order", () => {
    const result = glsLabelRequest(order({ shippingMethodCode: "gls-utanvet" }), everyLine, sender);

    expect(result.ok && result.request.cashOnDelivery).toBeUndefined();
  });

  it("never collects on a prepaid order, even when unpaid", () => {
    const result = glsLabelRequest(order({ payments: [] }), everyLine, sender);

    expect(result.ok && result.request.cashOnDelivery).toBeUndefined();
  });

  it("falls back to the customer's phone", () => {
    const result = glsLabelRequest(
      order({
        shippingAddress: { ...order().shippingAddress, phoneNumber: " " },
        customerPhone: "+36709999999",
      }),
      everyLine,
      sender
    );

    expect(result).toMatchObject({
      ok: true,
      request: { deliveryAddress: { contactPhone: "+36709999999" } },
    });
  });

  it("refuses an order that is not delivered by GLS", () => {
    expect(glsLabelRequest(order({ shippingMethodCode: "szemelyes" }), everyLine, sender)).toEqual({
      ok: false,
      reason:
        "A(z) ORD-1 rendelés nem GLS-szállítású (szemelyes), ezért nem készülhet hozzá GLS-címke.",
    });
  });

  it("refuses a second label while a non-cancelled one exists", () => {
    const withLabel = order({ fulfillments: [{ handlerCode: "gls", state: "Pending" }] });

    expect(refusal(glsLabelRequest(withLabel, everyLine, sender))).toContain(
      "már készült GLS-címke"
    );
  });

  it("allows a new label after the previous one was cancelled", () => {
    const relabel = order({
      fulfillments: [
        { handlerCode: "gls", state: "Cancelled" },
        { handlerCode: "manual-fulfillment", state: "Pending" },
      ],
    });

    expect(glsLabelRequest(relabel, everyLine, sender).ok).toBe(true);
  });

  it("refuses a partial fulfillment", () => {
    expect(
      refusal(glsLabelRequest(order(), [{ orderLineId: "1", quantity: 1 }], sender))
    ).toContain("összes tételét");
  });

  it("names every missing address part", () => {
    const result = glsLabelRequest(
      order({ shippingAddress: { fullName: "Teszt Címzett", streetLine1: "", countryCode: "HU" } }),
      everyLine,
      sender
    );

    expect(result).toEqual({
      ok: false,
      reason: "A(z) ORD-1 rendelés szállítási címéből hiányzik: utca, település, irányítószám.",
    });
  });
});

describe("splitHouseNumber", () => {
  it.each([
    ["10", { houseNumber: "10" }],
    ["12/A", { houseNumber: "12", houseNumberInfo: "/A" }],
    ["5. 2. em. 3.", { houseNumber: "5", houseNumberInfo: "2. em. 3." }],
    ["5.", { houseNumber: "5" }],
    [" 7 B ", { houseNumber: "7", houseNumberInfo: "B" }],
    ["hrsz. 123", { houseNumberInfo: "hrsz. 123" }],
    ["0", { houseNumberInfo: "0" }],
    ["", {}],
  ])("%j", (input, expected) => {
    expect(splitHouseNumber(input)).toEqual(expected);
  });
});
