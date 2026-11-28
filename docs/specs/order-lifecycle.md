# Order lifecycle

The placed order's state machine from placement to `Delivered`, including the
deposit branch's custom states ([ADR 0021](../adr/0021-barion-payment-integration.md)
§4). The default Vendure guards park a partially paid order in
`ArrangingPayment`, from which it cannot ship — the deposit branch has states
of its own, and the money path never branches on payment method: every
deposit (Barion callback, the Számlázz.hu IPN, the owner's dashboard action)
behaves identically.

## States and transitions

The custom `OrderProcess` adds two states to Vendure's default graph
(`backend/src/order-state-process.ts`); everything else is the default
transition graph. `Order.state` is a plain `String!` in both APIs.

| From               | To                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ArrangingPayment` | + `DepositPaid`                                                                                                                            |
| `DepositPaid`      | `PaymentSettled`, `PartiallyShipped`, `Shipped`, `PartiallyDelivered`, `Delivered`, `Cancelled`, `Modifying`, `ArrangingAdditionalPayment` |
| `Shipped`          | + `Returned`                                                                                                                               |
| `Returned`         | `Cancelled`, `Shipped`, `Modifying`                                                                                                        |

## The arrangement

The delivery variant carries the payment arrangement in its `deposit`
shipping-method custom field: `0` = full prepay, `> 0` = the deposit collected
at placement (the remainder at handover). It is the single source the
checkout copy, the Barion gateway request, the GLS label and the invoice
builder read; it is never hardcoded per consumer. The deposit never exceeds
the order's total (an order cheaper than the deposit is fully prepaid by its
deposit payment). `gls-utanvet` carries the 6 000 Ft deposit.

- **Scenario: The deposit's single source**
  - WHEN a deferred variant's order is priced, labeled or invoiced
  - THEN every consumer reads the deposit from the variant's `deposit` field,
    clamped to the order total — never from a constant

## Payment recording

- **Barion deposit payment** — a deferred variant's gateway payment charges
  the deposit alone; the gateway shows a single bare deposit line
  ("Előleg — Babasarok rendelés #<order code>"), no itemized order context.
  The intent row and the recorded Payment carry `role: "deposit"`.
- **The deposit leaves `ArrangingPayment`** — once a deposit-role payment is
  settled (whatever method recorded it), the order moves to `DepositPaid`.
  The payment-method-agnostic rule: a deposit recorded by the Barion
  callback, the IPN or the dashboard's `recordDepositPayment` behaves
  identically.
- **The dashboard's deposit recording** — the dashboard's manual-payment
  action records only the exact deficit, so the 6 000 Ft deposit has its own
  `recordDepositPayment(orderId)` admin mutation (the order-lifecycle
  plugin): it records the variant's deposit as a settled `bank-transfer`
  payment and moves the order to `DepositPaid`. It refuses non-deposit
  orders and orders that already left `ArrangingPayment`.
- **The COD remainder's settle-on-delivery leg** — from `Shipped` (or
  `DepositPaid` for an early recording):
  `ArrangingAdditionalPayment → addManualPaymentToOrder (the deficit) →
PaymentSettled`, the transition out being the owner's manual state change
  (the payment process deliberately leaves the order there).

- **Scenario: Deposit recorded, order proceeds**
  - WHEN a deposit-role payment settles on an order in `ArrangingPayment`
  - THEN the order is in `DepositPaid`, and fulfillment may proceed
- **Scenario: Deposit recording refused twice**
  - WHEN `recordDepositPayment` runs on an order already past
    `ArrangingPayment`
  - THEN it is refused with the order's state named
- **Scenario: Deposit refused on a full-prepay order**
  - WHEN `recordDepositPayment` runs on an order whose variant carries no
    deposit
  - THEN it is refused (nothing to record)

## The GLS label's deposit guard

The `gls` fulfillment handler refuses the label for a deposit-bearing
afterpay order whose deposit is not yet recorded (the order still in
`ArrangingPayment`): without it the courier would collect the deposit too,
breaking the deposit-now, rest-at-handover promise. After the deposit, the
label's COD amount is the outstanding total (the remainder).

- **Scenario: Label before the deposit**
  - WHEN the owner fulfills a `gls-utanvet` order still in `ArrangingPayment`
  - THEN the fulfillment is refused with the deposit named, nothing created
    at GLS
- **Scenario: Label after the deposit**
  - WHEN the deposit is recorded and the owner fulfills
  - THEN the label collects the remainder (total − deposit)

## The fulfillment-started boundary

The order's `fulfillmentStartedAt` custom field (a datetime) marks when the
owner started making the product — her definition spans production and
shipping ("ready-made" means materials at hand). Vendure fulfillments are
created at shipping time and mark the wrong boundary, so the flag is ours.
The dashboard's order page carries the "Munkafolyamat" block with the
deposit recording and the fulfillment-start action; the first stamp wins
(later calls are no-ops). The refund policy (a later slice) reads this flag.

- **Scenario: The boundary stamped once**
  - WHEN the owner marks the fulfillment started twice
  - THEN the first timestamp stands

## Returned

The GLS status poll moves the order to `Returned` when the parcel is
**actually returned to sender** (GLS problem codes 23/40) — the state entry
is the flag; the automatic act stops there, no auto-cancel. The other
problem statuses (16 no cash, 17 refused, 20 address) never leave the
delivery path and stay owner-flagged as before. The owner's exits from
`Returned`: `Cancelled` (the deposit kept per the refund policy) or back
into the fulfillment path (`Shipped` after re-fulfillment).

- **Scenario: Parcel returned to sender**
  - WHEN GLS reports code 23 or 40 for a handed-over parcel of a `Shipped`
    order
  - THEN the order is in `Returned`, the owner is emailed and the order
    carries a private note as before
- **Scenario: Re-fulfillment after a return**
  - WHEN the owner cancels the returned fulfillment and hands over a new
    parcel
  - THEN the order moves `Returned → Shipped` with the new parcel
