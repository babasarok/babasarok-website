/**
 * Seam 4: placing an order. The native sequence (ADR 0013 decision 5:
 * customer, address, shipping method, notes, transition to ArrangingPayment)
 * crosses Vendure's order state machine, our readiness process, the placed
 * strategy, the free-shipping promotion and the order emails built from the
 * placed order (file transport). The legacy `submitQuoteOrder` mutation must
 * keep working unchanged for the deploy-skew window (decision 8).
 *
 * Also the registered-email collision: a guest saving the email of a
 * registered customer is refused with a result error, and the order stays
 * usable. The site relies on this: a refused save must not block submission
 * (it resends everything at submit), and a different email recovers the order.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { seedCatalog } from "./fixtures";
import { emailsFor, emailText, run, startServer, type IntegrationServer } from "./harness";
import { feszek, parna, szalag } from "./lines";
import {
  activeOrder,
  addLine,
  BUYER,
  BUYER_ADDRESS,
  chooseShipping,
  createRegisteredCustomer,
  newShopper,
  setAddress,
  setCustomer,
  setOrderNotes,
  transitionTo,
  type Order,
} from "./shop";

const PAMUT = { material: "int-pamut" } as const;
const OWNER_EMAIL = "rendeles@babasarok.test";

let server: IntegrationServer;

beforeAll(async () => {
  server = await startServer();
  await seedCatalog(server);
});

afterAll(async () => {
  await server.stop();
});

async function placeNativeOrder(transactionId: string, extraFeszek: number): Promise<Order> {
  const shopper = newShopper(server);

  await addLine(
    shopper,
    parna({ material: "int-pamut", color: "kek" }, { quantity: 2, szegely: true, meret: "nagy" })
  );
  await addLine(shopper, szalag(150));

  if (extraFeszek > 0) {
    await addLine(shopper, feszek(PAMUT, PAMUT, extraFeszek));
  }

  await setCustomer(shopper);
  await setAddress(shopper);
  await chooseShipping(shopper, "gls-elore-utalas");
  await setOrderNotes(shopper, {
    message: "Köszönöm",
    termsAccepted: true,
    submissionTransactionId: transactionId,
  });

  const result = await transitionTo(shopper, "ArrangingPayment");

  if ("refusal" in result) {
    throw new Error(result.refusal);
  }

  return result.order;
}

describe("placing an order with the native sequence", () => {
  it("stores the buyer, address, shipping and notes on a placed order", async () => {
    const order = await placeNativeOrder("native-1", 0);

    expect(order.state).toBe("ArrangingPayment");
    expect(order.customer).toEqual(BUYER);
    expect(order.shippingAddress).toEqual({ streetLine1: BUYER_ADDRESS, countryCode: "HU" });
    expect(order.shippingLines.map((line) => line.shippingMethod.code)).toEqual([
      "gls-elore-utalas",
    ]);
    expect(order.customFields).toEqual({
      message: "Köszönöm",
      termsAccepted: true,
      submissionTransactionId: "native-1",
    });
  });

  it("summarises each native line's configuration into its configText field", async () => {
    const order = await placeNativeOrder("native-configtext", 0);

    for (const line of order.lines) {
      const selections = JSON.parse(line.customFields.selections ?? "{}") as Record<
        string,
        unknown
      >;

      if (Object.keys(selections).length === 0) {
        continue;
      }

      expect(line.customFields.configText).toBeTruthy();
      expect(line.customFields.configText).toContain(": ");
    }
  });

  it("charges the delivery below the free-shipping threshold and says so in both emails", async () => {
    const order = await placeNativeOrder("native-2", 0);

    expect(order.shippingLines.map((line) => line.priceWithTax)).toEqual([2500]);

    const emails = await emailsFor(order.code, 2);

    expect(emails.map((email) => email.recipient).toSorted()).toEqual(
      [BUYER.emailAddress, OWNER_EMAIL].toSorted()
    );

    for (const email of emails) {
      const body = emailText(email.body);

      expect(body).toContain("Párna (2 db)");
      expect(body).toContain("Anyag: int-pamut (kek)");
      expect(body).toContain("Szegély: Igen");
      expect(body).toContain("Méret: Nagy");
      expect(body).toContain("Szalag (1 db)");
      expect(body).toContain("Hossz: 150 cm");
      expect(body).toContain("GLS házhozszállítás előre utalással");
      expect(body).toContain("2500 Ft");
    }
  });

  it("delivers free above the threshold: the shipping line is zero and the emails say ingyenes", async () => {
    const order = await placeNativeOrder("native-3", 5);
    const total = order.subTotalWithTax;

    expect(total).toBeGreaterThanOrEqual(60_000);
    expect(order.shippingWithTax).toBe(0);
    expect(order.totalWithTax).toBe(total);

    for (const email of await emailsFor(order.code, 2)) {
      const body = emailText(email.body);

      expect(body).toContain("Fészek (5 db)");
      expect(body).toContain("ingyenes");
    }
  });
});

describe("a guest using a registered customer's email", () => {
  it("is refused without harming the order, and a different email recovers it", async () => {
    await createRegisteredCustomer(server, "regisztralt@example.com");

    const shopper = newShopper(server);
    const before = await addLine(shopper, parna(PAMUT));

    await expect(setCustomer(shopper, "regisztralt@example.com")).rejects.toMatchObject({
      errorCode: "EMAIL_ADDRESS_CONFLICT_ERROR",
      message: "The email address is not available.",
    });

    const after = await activeOrder(shopper);

    expect(after.state).toBe("AddingItems");
    expect(after.customer).toBeNull();
    // Line identity survives the refused save; the configText summary lands
    // asynchronously, so the comparison stays on the stable shape.
    expect(after.lines.map((line) => [line.id, line.productVariant.sku, line.quantity])).toEqual(
      before.lines.map((line) => [line.id, line.productVariant.sku, line.quantity])
    );

    const recovered = await setCustomer(shopper);

    expect(recovered.customer?.emailAddress).toBe(BUYER.emailAddress);
    await setAddress(shopper);
    await chooseShipping(shopper, "szemelyes");
    await setOrderNotes(shopper, {
      message: "",
      termsAccepted: true,
      submissionTransactionId: "collision-1",
    });
    expect(await transitionTo(shopper, "ArrangingPayment")).toMatchObject({
      order: { state: "ArrangingPayment" },
    });
  });
});

const LegacyStoredSchema = z.object({
  orders: z.object({
    items: z.array(
      z.object({
        state: z.string(),
        customer: z.object({ emailAddress: z.string() }),
        shippingLines: z.array(z.unknown()),
        discounts: z.array(z.unknown()),
        shippingAddress: z.object({ streetLine1: z.string().nullable() }),
        customFields: z.object({
          message: z.string().nullable(),
          deliveryMethodName: z.string().nullable(),
          deliveryPrice: z.number().nullable(),
          deliveryFree: z.boolean().nullable(),
          orderTotal: z.number().nullable(),
          setDiscountSummary: z.string().nullable(),
          termsAccepted: z.boolean().nullable(),
          submissionTransactionId: z.string().nullable(),
        }),
        lines: z.array(
          z.object({
            quantity: z.number(),
            customFields: z.object({
              title: z.string().nullable(),
              configText: z.string().nullable(),
              detailsJson: z.string().nullable(),
              quotedUnitPrice: z.number().nullable(),
              quotedLineTotal: z.number().nullable(),
            }),
          })
        ),
      })
    ),
  }),
});

const legacyPayload = {
  name: "Kovács Béla",
  email: "legacy@example.com",
  phone: "+36301234567",
  products: [
    {
      slug: "legacy-parna",
      title: "Párna",
      count: 2,
      details: [
        { label: "Méret", value: "Nagy", depth: 0 },
        { label: "Felirat", value: "Bence", depth: 1 },
      ],
      unitPrice: 6000,
      lineTotal: 12_000,
    },
    {
      slug: "legacy-takaro",
      title: "Takaró",
      count: 1,
      configText: "Anyag: Pamut\nSzín: Kék",
      unitPrice: 9000,
      lineTotal: 9000,
    },
  ],
  deliveryMethod: "__GLS házhozszállítás__ előre utalással",
  deliveryPrice: 2500,
  deliveryFree: false,
  needsAddress: true,
  address: "3894 Telkibánya, Fő u. 1.",
  message: "Köszönöm",
  setDiscountSummary: "Szett: 1300 Ft (1. termék)",
  totalPrice: 23_500,
  termsAccepted: true,
  transactionId: "legacy-roundtrip",
};

describe("the legacy submitQuoteOrder mutation", () => {
  it("stores exactly the payload it is sent and emails from the client details", async () => {
    const submitted = await run(
      newShopper(server).client,
      `mutation($input: QuoteOrderInput!) {
        submitQuoteOrder(input: $input) {
          __typename
          ... on SubmitQuoteOrderSuccess { orderCode }
          ... on SubmitQuoteOrderError { message }
        }
      }`,
      { input: legacyPayload },
      z.object({
        submitQuoteOrder: z.union([
          z.object({ __typename: z.literal("SubmitQuoteOrderSuccess"), orderCode: z.string() }),
          z.object({ __typename: z.literal("SubmitQuoteOrderError"), message: z.string() }),
        ]),
      })
    );
    const result = submitted.submitQuoteOrder;

    if (result.__typename !== "SubmitQuoteOrderSuccess") {
      throw new Error(result.message);
    }

    const { orders } = await run(
      server.admin,
      `query($code: String!) {
        orders(options: { filter: { code: { eq: $code } } }) {
          items {
            state
            customer { emailAddress }
            shippingLines { id }
            discounts { description }
            shippingAddress { streetLine1 }
            customFields {
              message deliveryMethodName deliveryPrice deliveryFree orderTotal
              setDiscountSummary termsAccepted submissionTransactionId
            }
            lines { quantity customFields { title configText detailsJson quotedUnitPrice quotedLineTotal } }
          }
        }
      }`,
      { code: result.orderCode },
      LegacyStoredSchema
    );
    const stored = orders.items[0];

    if (stored === undefined) {
      throw new Error("The legacy order was not stored.");
    }

    expect(stored).toMatchObject({
      state: "ArrangingPayment",
      customer: { emailAddress: legacyPayload.email },
      shippingLines: [],
      discounts: [],
      shippingAddress: { streetLine1: legacyPayload.address },
      customFields: {
        message: legacyPayload.message,
        deliveryMethodName: legacyPayload.deliveryMethod,
        deliveryPrice: legacyPayload.deliveryPrice,
        deliveryFree: false,
        orderTotal: legacyPayload.totalPrice,
        setDiscountSummary: legacyPayload.setDiscountSummary,
        termsAccepted: true,
        submissionTransactionId: legacyPayload.transactionId,
      },
    });
    expect(
      stored.lines
        .toSorted((a, b) => (a.customFields.title ?? "").localeCompare(b.customFields.title ?? ""))
        .map((line) => [
          line.quantity,
          line.customFields.title,
          line.customFields.configText,
          line.customFields.detailsJson,
          line.customFields.quotedUnitPrice,
          line.customFields.quotedLineTotal,
        ])
    ).toEqual([
      [2, "Párna", null, JSON.stringify(legacyPayload.products[0]?.details), 6000, 12_000],
      [1, "Takaró", "Anyag: Pamut\nSzín: Kék", null, 9000, 9000],
    ]);

    const emails = await emailsFor(result.orderCode, 2);
    const notification = emails.find((email) => email.recipient !== legacyPayload.email);

    expect(notification?.subject).toBe(`Új árajánlatkérés: ${result.orderCode}`);
    expect(emails.find((email) => email.recipient === legacyPayload.email)?.subject).toBe(
      `Köszönjük a rendelésed: ${result.orderCode}`
    );

    for (const email of emails) {
      const body = emailText(email.body);

      expect(body).toMatch(/1\. Párna \(2 db\)/);
      expect(body).toContain("Méret: Nagy");
      expect(body).toContain("Felirat: Bence");
      expect(body).toContain("Anyag: Pamut Szín: Kék");
      expect(body).toContain("Szett: 1300 Ft (1. termék)");
      expect(body).toContain("GLS házhozszállítás előre utalással");
      expect(body).toContain("Összesen: 23500 Ft");
    }
  });
});
