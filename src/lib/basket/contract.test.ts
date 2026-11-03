/**
 * Contract test: sends every basket/checkout query and mutation document from
 * createBasketApi to a live shop API and fails when the schema rejects one
 * (unknown field, argument or type, invalid variable shape). Business errors
 * (no active order, unknown variant) prove the schema accepted the document.
 * The calls perform real mutations (addItem creates an anonymous guest
 * order on the target API): point it at a test API, not production.
 * Skipped unless BASKET_CONTRACT_API_URL is set, e.g. against
 * `pnpm -C backend run e2e:server` (http://localhost:4000) or a seeded dev
 * backend: BASKET_CONTRACT_API_URL=http://localhost:4000 pnpm test
 */
import { describe, expect, it } from "vitest";
import { createBasketApi } from "./api";

const apiUrl = process.env.BASKET_CONTRACT_API_URL;

const SCHEMA_REJECTION =
  /Cannot query field|Unknown (argument|type)|Unknown field|Variable "|of required type|Field "[^"]+" (of type|argument)/;

describe.skipIf(apiUrl === undefined)("basket contract against the live shop API", () => {
  it("is accepted by the schema for every basket and checkout document", async () => {
    const rejections: string[] = [];
    const api = createBasketApi({
      apiUrl: apiUrl ?? "",
      languageCode: "hu",
      tokens: { get: () => null, set: () => {} },
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        const body: unknown = await response.clone().json();
        const text = JSON.stringify(body);

        if (SCHEMA_REJECTION.test(text) || response.status === 400) {
          rejections.push(...(text.match(/"message":"(?:[^"\\]|\\.)*"/g) ?? [text]));
        }

        return response;
      },
    });

    await api.activeOrder();
    await api.addItem({
      productVariantId: "1",
      quantity: 1,
      customFields: { selections: "{}", lengthCm: 1 },
    });
    await api.adjustLine("1", 1);
    await api.removeLine("1");
    await api.productVariants("contract-test");
    await api.eligibleShippingMethods();
    await api.setCustomer({
      emailAddress: "contract@example.com",
      firstName: "A",
      lastName: "B",
      phoneNumber: "1",
    });
    await api.setShippingAddress("Street 1", "HU");
    await api.setShippingMethod("1");
    await api.setOrderCustomFields({
      message: "m",
      termsAccepted: true,
      submissionTransactionId: "t",
    });
    await api.transitionToArrangingPayment();

    expect([...new Set(rejections)]).toEqual([]);
  });
});
