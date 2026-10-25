import { describe, expect, it } from "vitest";
import { QuoteOrderSchema, splitName } from "./quote-order.input";

const validInput = {
  name: "Szabó Anna",
  email: "anna@example.com",
  phone: "+36301234567",
  products: [
    {
      slug: "babafeszek",
      title: "Babafészek",
      count: 2,
      configText: "Babafészek (2db)\n  Méret: 80",
      unitPrice: 15_000,
      lineTotal: 30_000,
    },
  ],
  deliveryMethod: "Házhozszállítás",
  deliveryPrice: 1_500,
  deliveryFree: false,
  needsAddress: true,
  address: "1117 Budapest, Teszt utca 1.",
  totalPrice: 31_500,
  termsAccepted: true,
  transactionId: "tx-1700000000000",
};

describe("QuoteOrderSchema", () => {
  it("accepts a valid payload", () => {
    expect(QuoteOrderSchema.parse(validInput)).toMatchObject(validInput);
  });

  it("rejects unaccepted terms", () => {
    const result = QuoteOrderSchema.safeParse({ ...validInput, termsAccepted: false });
    expect(result.success).toBe(false);
  });

  it("requires an address when the delivery method needs one", () => {
    const result = QuoteOrderSchema.safeParse({ ...validInput, address: undefined });
    expect(result.success).toBe(false);
  });

  it("allows a missing address for pickup", () => {
    const result = QuoteOrderSchema.safeParse({
      ...validInput,
      needsAddress: false,
      address: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty basket", () => {
    const result = QuoteOrderSchema.safeParse({ ...validInput, products: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a negative delivery price", () => {
    const result = QuoteOrderSchema.safeParse({ ...validInput, deliveryPrice: -1 });
    expect(result.success).toBe(false);
  });

  it("accepts any non-empty phone (old pipeline delivered as-is)", () => {
    const result = QuoteOrderSchema.safeParse({ ...validInput, phone: "06 30" });
    expect(result.success).toBe(true);
  });
});

describe("splitName", () => {
  it("splits Hungarian surname-first names", () => {
    expect(splitName("Szabó Anna Mária")).toEqual({
      lastName: "Szabó",
      firstName: "Anna Mária",
    });
  });

  it("puts a single token in firstName", () => {
    expect(splitName("Anna")).toEqual({ firstName: "Anna", lastName: "" });
  });
});
