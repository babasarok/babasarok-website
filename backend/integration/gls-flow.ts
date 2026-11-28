/**
 * Shared GLS order-flow helpers for the integration suites: placing GLS
 * orders through the shop API and fulfilling them with the `gls` handler
 * through the admin API.
 */
import { z } from "zod";
import type { IntegrationServer } from "./harness";
import { run } from "./harness";
import { kendo, szalag } from "./lines";
import {
  addLine,
  chooseShipping,
  newShopper,
  setAddress,
  setCustomer,
  setOrderNotes,
  transitionTo,
} from "./shop";

export const GLS_SENDER = {
  name: "Babasarok",
  street: "Fő utca",
  houseNumber: "1",
  city: "Telkibánya",
  zipCode: "3896",
  countryCode: "HU",
  phone: "+36301234567",
  email: "bolt@example.com",
};

export const PlacedSchema = z.object({
  id: z.string(),
  code: z.string(),
  totalWithTax: z.number(),
  lines: z.array(z.object({ id: z.string(), quantity: z.number() })),
});

export type Placed = z.output<typeof PlacedSchema>;

const FulfillResultSchema = z.object({
  addFulfillmentToOrder: z.union([
    z.object({
      __typename: z.literal("Fulfillment"),
      id: z.string(),
      method: z.string(),
      trackingCode: z.string(),
      state: z.string(),
    }),
    z.object({
      __typename: z.string(),
      errorCode: z.string(),
      fulfillmentHandlerError: z.string().optional(),
    }),
  ]),
});

export type FulfillResult = z.output<typeof FulfillResultSchema>["addFulfillmentToOrder"];

export async function placeOrder(
  server: IntegrationServer,
  shippingCode: string,
  lines = [kendo(2), szalag(120)]
): Promise<Placed> {
  const shopper = newShopper(server);

  for (const line of lines) {
    await addLine(shopper, line);
  }

  await setCustomer(shopper);
  await setAddress(shopper, { fullName: "Kovács Béla", phoneNumber: "+36309999999" });
  await chooseShipping(shopper, shippingCode);
  await setOrderNotes(shopper, { message: "", termsAccepted: true });

  const result = await transitionTo(shopper, "ArrangingPayment");

  if ("refusal" in result) {
    throw new Error(JSON.stringify(result.refusal));
  }

  const data = await run(
    server.admin,
    `query($code: String!) {
      orders(options: { filter: { code: { eq: $code } } }) { items { id code totalWithTax lines { id quantity } } }
    }`,
    { code: result.order.code },
    z.object({ orders: z.object({ items: z.tuple([PlacedSchema]) }) })
  );

  return data.orders.items[0];
}

export async function recordBankTransfer(
  server: IntegrationServer,
  order: Placed
): Promise<string> {
  const data = await run(
    server.admin,
    `mutation($orderId: ID!) {
      addManualPaymentToOrder(input: { orderId: $orderId, method: "banki-atutalas", metadata: {} }) {
        __typename ... on Order { state }
      }
    }`,
    { orderId: order.id },
    z.object({ addManualPaymentToOrder: z.object({ state: z.string() }) })
  );

  return data.addManualPaymentToOrder.state;
}

/** The deposit path: `recordDepositPayment` and the order moves to DepositPaid. */
export async function recordDeposit(server: IntegrationServer, order: Placed): Promise<string> {
  const data = await run(
    server.admin,
    `mutation($orderId: ID!) {
      recordDepositPayment(orderId: $orderId) { state }
    }`,
    { orderId: order.id },
    z.object({ recordDepositPayment: z.object({ state: z.string() }) })
  );

  return data.recordDepositPayment.state;
}

/** The dashboard's manual order-state change (Vendure's order state control). */
export async function transitionOrder(
  server: IntegrationServer,
  order: Placed,
  state: string
): Promise<string> {
  const data = await run(
    server.admin,
    `mutation($orderId: ID!, $state: String!) {
      transitionOrderToState(id: $orderId, state: $state) {
        __typename ... on Order { state } ... on ErrorResult { errorCode message }
      }
    }`,
    { orderId: order.id, state },
    z.object({
      transitionOrderToState: z.union([
        z.object({ __typename: z.literal("Order"), state: z.string() }),
        z.object({ __typename: z.string(), errorCode: z.string(), message: z.string() }),
      ]),
    })
  );

  const transition = data.transitionOrderToState;

  if (!("state" in transition)) {
    throw new Error(`transition to ${state} refused: ${transition.message}`);
  }

  return transition.state;
}

export async function fulfill(
  server: IntegrationServer,
  order: Placed,
  lines = order.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity }))
): Promise<FulfillResult> {
  const data = await run(
    server.admin,
    `mutation($input: FulfillOrderInput!) {
      addFulfillmentToOrder(input: $input) {
        __typename
        ... on Fulfillment { id method trackingCode state }
        ... on CreateFulfillmentError { errorCode fulfillmentHandlerError }
        ... on ErrorResult { errorCode }
      }
    }`,
    { input: { lines, handler: { code: "gls", arguments: [] } } },
    FulfillResultSchema
  );

  return data.addFulfillmentToOrder;
}

export async function setSender(
  server: IntegrationServer,
  sender: typeof GLS_SENDER
): Promise<void> {
  const { activeChannel } = await run(
    server.admin,
    `query { activeChannel { id } }`,
    {},
    z.object({ activeChannel: z.object({ id: z.string() }) })
  );

  await run(
    server.admin,
    `mutation($input: UpdateChannelInput!) { updateChannel(input: $input) { __typename } }`,
    { input: { id: activeChannel.id, customFields: { glsSender: sender } } },
    z.unknown()
  );
}

export function handlerError(result: FulfillResult): string | undefined {
  if (result.__typename === "Fulfillment" || !("fulfillmentHandlerError" in result)) {
    return undefined;
  }

  return result.fulfillmentHandlerError;
}
