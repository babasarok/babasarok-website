/**
 * Regression check for the legacy checkout (ADR 0013 decision 8): the old
 * site's `submitQuoteOrder` mutation must keep storing exactly the payload it
 * is sent, place the order without a shipping line or discounts, and email the
 * buyer and the owner from the client `details` / `configText`.
 *
 * Needs a running backend with file mail transport (no EMAIL_TRANSPORT, so
 * emails land in EMAIL_OUT_DIR, default ./email-out) and a worker draining the
 * job queue, plus SUPERADMIN_* in the environment.
 *
 * Run: pnpm -C backend run test:quote-roundtrip
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { adminRequest, authenticate } from "./lib/admin-client";

const SHOP_URL = `http://localhost:${process.env.PORT ?? "4000"}/shop-api`;
const EMAIL_OUT_DIR = path.resolve(process.env.EMAIL_OUT_DIR ?? "email-out");

const SubmitSchema = z.object({
  submitQuoteOrder: z.union([
    z.object({ __typename: z.literal("SubmitQuoteOrderSuccess"), orderCode: z.string() }),
    z.object({ __typename: z.literal("SubmitQuoteOrderError"), message: z.string() }),
  ]),
});

const StoredOrderSchema = z.object({
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

const EmailSchema = z.object({ subject: z.string(), recipient: z.string(), body: z.string() });

const payload = {
  name: "Kovács Béla",
  email: "roundtrip@example.com",
  phone: "+36301234567",
  products: [
    {
      slug: "roundtrip-parna",
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
      slug: "roundtrip-takaro",
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
  transactionId: `roundtrip-${Date.now()}`,
};

const SUBMIT = `mutation($input: QuoteOrderInput!) {
  submitQuoteOrder(input: $input) {
    __typename
    ... on SubmitQuoteOrderSuccess { orderCode }
    ... on SubmitQuoteOrderError { message }
  }
}`;

const STORED = `query($code: String!) {
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
}`;

async function submit(): Promise<string> {
  const response = await fetch(SHOP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Apollo-Require-Preflight": "true" },
    body: JSON.stringify({ query: SUBMIT, variables: { input: payload } }),
  });
  const body = z.object({ data: SubmitSchema }).parse(await response.json());
  const result = body.data.submitQuoteOrder;

  if (result.__typename !== "SubmitQuoteOrderSuccess") {
    throw new Error(result.message);
  }

  return result.orderCode;
}

async function emailsFor(code: string): Promise<Array<z.infer<typeof EmailSchema>>> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const files = (await readdir(EMAIL_OUT_DIR)).filter((file) =>
      file.includes(code.toLowerCase())
    );

    if (files.length >= 2) {
      return Promise.all(
        files.map(async (file) =>
          EmailSchema.parse(JSON.parse(await readFile(path.join(EMAIL_OUT_DIR, file), "utf8")))
        )
      );
    }

    await sleep(1000);
  }

  throw new Error(`no emails for ${code} in ${EMAIL_OUT_DIR}`);
}

function text(html: string): string {
  return html
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

const code = await submit();

await authenticate();

const stored = StoredOrderSchema.parse(
  (await adminRequest(JSON.stringify({ query: STORED, variables: { code } }))).data
).orders.items[0];

assert.equal(stored.state, "ArrangingPayment");
assert.equal(stored.customer.emailAddress, payload.email);
assert.deepEqual(stored.shippingLines, []);
assert.deepEqual(stored.discounts, []);
assert.equal(stored.shippingAddress.streetLine1, payload.address);
assert.deepEqual(stored.customFields, {
  message: payload.message,
  deliveryMethodName: payload.deliveryMethod,
  deliveryPrice: payload.deliveryPrice,
  deliveryFree: false,
  orderTotal: payload.totalPrice,
  setDiscountSummary: payload.setDiscountSummary,
  termsAccepted: true,
  submissionTransactionId: payload.transactionId,
});
assert.deepEqual(
  stored.lines.map((line) => [
    line.quantity,
    line.customFields.title,
    line.customFields.configText,
    line.customFields.detailsJson,
    line.customFields.quotedUnitPrice,
    line.customFields.quotedLineTotal,
  ]),
  [
    [2, "Párna", null, JSON.stringify(payload.products[0].details), 6000, 12_000],
    [1, "Takaró", "Anyag: Pamut\nSzín: Kék", null, 9000, 9000],
  ]
);

const emails = await emailsFor(code);
const confirmation = emails.find((email) => email.recipient === payload.email);
const notification = emails.find((email) => email.recipient !== payload.email);

assert.ok(confirmation && notification, "both emails sent");
assert.equal(confirmation.subject, `Köszönjük a rendelésed: ${code}`);
assert.equal(notification.subject, `Új árajánlatkérés: ${code}`);

for (const email of [confirmation, notification]) {
  const body = text(email.body);

  assert.match(body, /1\. Párna \(2 db\)/);
  assert.match(body, /Méret: Nagy/);
  assert.match(body, /Felirat: Bence/);
  assert.match(body, /2\. Takaró \(1 db\)/);
  assert.match(body, /Anyag: Pamut Szín: Kék/);
  assert.match(body, /Szett: 1300 Ft \(1\. termék\)/);
  assert.match(body, /GLS házhozszállítás előre utalással/);
  assert.match(body, /2500 Ft/);
  assert.match(body, /Összesen: 23500 Ft/);
}

console.log(`quote-order round trip OK (${code})`);
