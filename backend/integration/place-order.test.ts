/**
 * Seam 4: placing an order. The native sequence (ADR 0013 decision 5:
 * customer, address, shipping method, notes, transition to ArrangingPayment)
 * crosses Vendure's order state machine, our readiness process, the placed
 * strategy, the free-shipping promotion and the order emails built from the
 * placed order (file transport).
 *
 * Also the registered-email collision: a guest saving the email of a
 * registered customer is refused with a result error, and the order stays
 * usable. The site relies on this: a refused save must not block submission
 * (it resends everything at submit), and a different email recovers the order.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCatalog } from "./fixtures";
import { emailsFor, emailText, startServer, type IntegrationServer } from "./harness";
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
  setBillingAddress,
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
    throw new Error(JSON.stringify(result.refusal));
  }

  return result.order;
}

describe("placing an order with the native sequence", () => {
  it("stores the buyer, address, shipping and notes on a placed order", async () => {
    const order = await placeNativeOrder("native-1", 0);

    expect(order.state).toBe("ArrangingPayment");
    expect(order.customer).toEqual(BUYER);
    expect(order.shippingAddress).toEqual({
      company: null,
      streetLine1: BUYER_ADDRESS.street,
      streetLine2: BUYER_ADDRESS.houseNumber,
      postalCode: BUYER_ADDRESS.postalCode,
      city: BUYER_ADDRESS.city,
      countryCode: "HU",
    });
    expect(order.billingAddress).toEqual({
      company: null,
      streetLine1: null,
      streetLine2: null,
      postalCode: null,
      city: null,
      countryCode: null,
    });
    expect(order.shippingLines.map((line) => line.shippingMethod.code)).toEqual([
      "gls-elore-utalas",
    ]);
    expect(order.customFields).toEqual({
      message: "Köszönöm",
      termsAccepted: true,
      taxNumber: null,
      submissionTransactionId: "native-1",
    });
  });

  it("stores the billing address and the tax number of a business buyer", async () => {
    const shopper = newShopper(server);

    await addLine(shopper, parna(PAMUT));
    await setCustomer(shopper);
    await setAddress(shopper);
    await setBillingAddress(shopper, "Minta Kft.", "Minta Pénzügy");
    await chooseShipping(shopper, "gls-elore-utalas");
    await setOrderNotes(shopper, {
      message: "",
      termsAccepted: true,
      submissionTransactionId: "native-billing",
      taxNumber: "12345678-2-42",
    });

    const result = await transitionTo(shopper, "ArrangingPayment");

    expect(result).toMatchObject({ order: { state: "ArrangingPayment" } });

    const order = "order" in result ? result.order : undefined;

    expect(order?.billingAddress).toMatchObject({
      company: "Minta Kft.",
      streetLine1: BUYER_ADDRESS.street,
      city: BUYER_ADDRESS.city,
      countryCode: "HU",
    });
    expect(order?.customFields.taxNumber).toBe("12345678-2-42");

    for (const email of await emailsFor(order?.code ?? "", 2)) {
      const body = emailText(email.body);

      expect(body).toContain("Számlázási adatok Minta Pénzügy Minta Kft. Fő u. 1. 3894 Telkibánya");
      expect(body).toContain("Adószám: 12345678-2-42");
      expect(body).not.toContain("Azonos a szállítási címmel");
    }
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
      expect(body).toContain("Szállítási cím Fő u. 1. 3894 Telkibánya");
      expect(body).toContain("Számlázási adatok Azonos a szállítási címmel");
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
