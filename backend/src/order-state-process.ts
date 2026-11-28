/**
 * The order-state additions of ADR 0021 §4 (the deposit branch's custom
 * path). Default Vendure guards park a partially paid order in
 * `ArrangingPayment`, from which it cannot ship — the deposit branch needs
 * a state of its own:
 *
 * - **DepositPaid** — a deposit-role payment (the arrangement's deposit,
 *   whatever method recorded it) settled on a placed order. It behaves like
 *   a partially paid `PaymentSettled`: the GLS hand-over moves it on
 *   (`Shipped`/`PartiallyShipped`), delivery closes it, an early recorded
 *   remainder goes through `Modifying`/`ArrangingAdditionalPayment` to
 *   `PaymentSettled`, and cancellation is the owner's call.
 * - **Returned** — the GLS worker's flag when a parcel is actually returned
 *   to sender (problem codes 23/40); the automatic act stops at the flag.
 *   Owner exits: `Cancelled` (deposit kept per the refund policy) or back
 *   into the fulfillment path (`Shipped` after re-fulfillment).
 *
 * `Order.state` is a plain `String!` in the GraphQL schema, so the states
 * surface to both APIs without schema changes.
 */
declare module "@vendure/core/dist/service/helpers/order-state-machine/order-state" {
  interface OrderStates {
    DepositPaid: never;
    Returned: never;
  }
}

import type { OrderProcess } from "@vendure/core";

export type LifecycleOrderState = "DepositPaid" | "Returned";

export const lifecycleOrderProcess: OrderProcess<LifecycleOrderState> = {
  transitions: {
    ArrangingPayment: {
      // Deposits ride every recording path (the Barion callback, the IPN,
      // the dashboard): the order leaves the un-shippable ArrangingPayment
      // for DepositPaid — payment-method-agnostic.
      to: ["DepositPaid"],
    },
    DepositPaid: {
      to: [
        "PaymentSettled",
        "PartiallyShipped",
        "Shipped",
        "PartiallyDelivered",
        "Delivered",
        "Cancelled",
        "Modifying",
        "ArrangingAdditionalPayment",
      ],
    },
    Returned: {
      to: ["Cancelled", "Shipped", "Modifying"],
    },
  },
};
