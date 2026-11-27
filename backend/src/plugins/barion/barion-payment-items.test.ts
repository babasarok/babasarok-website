import { describe, expect, it } from "vitest";
import {
  barionLocale,
  barionPhoneNumber,
  barionStartRequest,
  barionStatusDecision,
  toBarionAmount,
} from "./barion-payment-items";

describe("barionStatusDecision", () => {
  it("maps the terminal Barion states", () => {
    expect(barionStatusDecision("Succeeded")).toBe("Succeeded");
    expect(barionStatusDecision("Failed")).toBe("Failed");
    expect(barionStatusDecision("Canceled")).toBe("Failed");
    expect(barionStatusDecision("Expired")).toBe("Expired");
  });

  it("keeps everything else processing — the callback signal is never trusted", () => {
    expect(barionStatusDecision("Started")).toBe("Processing");
    expect(barionStatusDecision("Authorized")).toBe("Processing");
    expect(barionStatusDecision("PartiallySucceeded")).toBe("Processing");
    expect(barionStatusDecision("something new")).toBe("Processing");
    expect(barionStatusDecision("")).toBe("Processing");
  });
});

describe("toBarionAmount", () => {
  it("passes whole forints through at precision 0", () => {
    expect(toBarionAmount(15_000, 0)).toBe(15_000);
    expect(toBarionAmount(10, 0)).toBe(10);
  });

  it("divides the stored minor units by 10^precision", () => {
    expect(toBarionAmount(150_000, 2)).toBe(1500);
    expect(toBarionAmount(1050, 2)).toBe(10.5);
  });
});

describe("barionStartRequest", () => {
  const precision = 0;
  const options = {
    paymentRequestId: "ABCD1234-1",
    payeeEmail: "bolt@babasarok.test",
    redirectUrl: "https://babasarok.net/payment/confirmation?orderCode=ABCD1234",
    callbackUrl: "https://api.babasarok.net/payments/barion/callback",
  };

  const order = {
    code: "ABCD1234",
    currencyCode: "HUF",
    languageCode: "hu",
    totalWithTax: 26_500,
    shippingWithTax: 1500,
    lines: [{ name: "Párna", description: "Anyag: pamut", quantity: 2, linePriceWithTax: 25_000 }],
    customer: {
      emailAddress: "vevo@example.com",
      fullName: "Kovács Béla",
      phoneNumber: "+36301234567",
    },
    shippingAddress: {
      fullName: "Kovács Béla",
      countryCode: "HU",
      city: "Telkibánya",
      street: "Fő u.",
      street2: "1.",
      zipCode: "3894",
    },
  };

  it("builds the Immediate full-prepay request with honest itemized totals", () => {
    const request = barionStartRequest(order, precision, options);

    expect(request.total).toBe(26_500);
    expect(request.currencyCode).toBe("HUF");
    expect(request.locale).toBe("hu-HU");
    expect(request.payeeEmail).toBe("bolt@babasarok.test");

    const itemSum = request.items.reduce((sum, item) => sum + item.total, 0);

    expect(itemSum).toBe(request.total);
    expect(request.items).toEqual([
      {
        name: "Párna",
        description: "Anyag: pamut",
        quantity: 2,
        unitPrice: 12_500,
        total: 25_000,
      },
      {
        name: "Szállítás",
        description: "Kiszállítás a megrendeléshez",
        quantity: 1,
        unitPrice: 1500,
        total: 1500,
      },
    ]);
    expect(options.callbackUrl.endsWith("/payments/barion/callback")).toBe(true);
  });

  it("omits the shipping item when delivery is free", () => {
    const request = barionStartRequest(
      { ...order, totalWithTax: 25_000, shippingWithTax: 0 },
      precision,
      options
    );

    expect(request.items.map((item) => item.name)).toEqual(["Párna"]);
    expect(request.total).toBe(25_000);
    expect(request.items.reduce((sum, item) => sum + item.total, 0)).toBe(25_000);
  });

  it("converts stored cents at precision 2 (a future EUR channel)", () => {
    const request = barionStartRequest(
      { ...order, currencyCode: "EUR", totalWithTax: 26_500, shippingWithTax: 1500 },
      2,
      options
    );

    expect(request.total).toBe(265);
    expect(request.items.at(-1)?.total).toBe(15);
  });

  it("feeds the 3DS payer hints from the checkout's collected fields", () => {
    const request = barionStartRequest(order, precision, options);
    expect(request.payer).toEqual({
      emailAddress: "vevo@example.com",
      fullName: "Kovács Béla",
      phone: "36301234567",
      shippingAddress: order.shippingAddress,
    });
  });

  it("sends no payer when the order has no customer", () => {
    const request = barionStartRequest(
      { ...order, customer: null, shippingAddress: null },
      precision,
      options
    );

    expect(request.payer).toBeNull();
  });
});

describe("barionPhoneNumber", () => {
  it("normalises to Barion's 36701231234 shape", () => {
    expect(barionPhoneNumber("+36301234567")).toBe("36301234567");
    expect(barionPhoneNumber("06301234567")).toBe("36301234567");
    expect(barionPhoneNumber("36 30 123 4567")).toBe("36301234567");
    expect(barionPhoneNumber("0036301234567")).toBe("36301234567");
    expect(barionPhoneNumber("+13051234567")).toBe("13051234567");
  });

  it("loses nothing it cannot normalise", () => {
    expect(barionPhoneNumber("hívj fel")).toBeUndefined();
    expect(barionPhoneNumber("")).toBeUndefined();
  });
});

describe("barionLocale", () => {
  it("maps the order language to Barion's accepted locales", () => {
    expect(barionLocale("hu")).toBe("hu-HU");
    expect(barionLocale("en")).toBe("en-US");
    expect(barionLocale("de")).toBe("en-US");
  });
});
