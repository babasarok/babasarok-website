# Vendure payments — source grounding for ADR 0021

Last verified: 2026-11-15

This document grounds the Vendure claims in
[ADR 0021](adr/0021-barion-payment-integration.md) ("What we know about
ourselves") in primary sources: the actually-installed Vendure 3.8.1 source
under `backend/node_modules/@vendure/core/dist/`, this repo's own
`backend/src/vendure-config.ts`, and docs.vendure.io / the Vendure plugin
repositories for the patterns the source cannot show. Every code claim cites
`file:line`; every docs claim cites a URL. Where the ADR's wording does not
exactly match the source, the claim is flagged **NUANCE**, **CONTRADICTION**
or **UNVERIFIED** inline.

Sources used:

- Vendure core 3.8.1 (`backend/node_modules/@vendure/core/package.json`,
  `"version": "3.8.1"`), flat layout (not `.pnpm`-nested):
  `backend/node_modules/@vendure/core/dist/…`.
- Repo config: `backend/src/vendure-config.ts`.
- Docs: <https://docs.vendure.io/current/framework/core-concepts/payment>.
- Mollie plugin (reference implementation):
  <https://github.com/vendurehq/community-plugins>, `packages/mollie-plugin`
  (the old `vendureio/vendure-plugins` monorepo has moved there; the payment
  plugins were extracted from the core monorepo — see its MIGRATION.md).
- Plugin catalog: the community-plugins README package table and an npm
  registry search for "vendure barion" (2026-11-15).

## 1. The order state machine (OrderProcess transitions)

Source: `backend/node_modules/@vendure/core/dist/config/order/default-order-process.js`
(the `transitions` block, lines 56–118). The full edge list among the states
the ADR cares about:

| State                        | lines   |
| ---------------------------- | ------- |
| `ArrangingPayment`           | 66–68   |
| `PaymentAuthorized`          | 69–71   |
| `PaymentSettled`             | 72–82   |
| `PartiallyShipped`           | 83–85   |
| `Shipped`                    | 86–88   |
| `PartiallyDelivered`         | 89–91   |
| `Delivered`                  | 92–94   |
| `Modifying`                  | 95–104  |
| `ArrangingAdditionalPayment` | 105–114 |
| `Cancelled`                  | 115–117 |

The `to` lists, with the states the ADR cares about:

- `ArrangingPayment` → `PaymentAuthorized`, `PaymentSettled`,
  `AddingItems`, `Cancelled`.
- `PaymentAuthorized` → `PaymentSettled`, `Cancelled`, `Modifying`,
  `ArrangingAdditionalPayment`.
- `PaymentSettled` → `PartiallyDelivered`, `Delivered`,
  `PartiallyShipped`, `Shipped`, `Cancelled`, `Modifying`,
  `ArrangingAdditionalPayment`.
- `Shipped` → `PartiallyDelivered`, `Delivered`, `Cancelled`,
  `Modifying`.
- `Delivered` → `Cancelled`.
- `Modifying` → `PaymentAuthorized`, `PaymentSettled`,
  `PartiallyShipped`, `Shipped`, `PartiallyDelivered`,
  `ArrangingAdditionalPayment`.
- `ArrangingAdditionalPayment` → `PaymentAuthorized`, `PaymentSettled`,
  `PartiallyShipped`, `Shipped`, `PartiallyDelivered`, `Cancelled`.
- `Cancelled` → — (terminal).
- (`PartiallyShipped` → `Shipped`, `PartiallyDelivered`, `Cancelled`,
  `Modifying`; `PartiallyDelivered` → `Delivered`, `Cancelled`,
  `Modifying`.)

Verified ADR claims:

- **`PaymentAuthorized → Shipped` has no direct edge** — confirmed: the
  `PaymentAuthorized.to` list (lines 69–71) does not contain `Shipped`. The
  only routes from `PaymentAuthorized` toward shipping are via `Modifying`
  or via `ArrangingAdditionalPayment → Shipped` (which additionally
  requires shipped fulfillments, see claim 7).
- **`Delivered.to = ['Cancelled']`** — confirmed (lines 92–94).
- The states the ADR does not mention (`PartiallyShipped`,
  `PartiallyDelivered`) exist and are reachable mid-flow; any custom state
  design must account for them.

Custom states are a documented first-class mechanism: an `OrderProcess` can
add states with `mergeStrategy: 'replace'` per-source-state, and the docs'
custom-payment-flows example adds a `ValidatingPayment` order state next to
`ArrangingPayment` exactly this way
(<https://docs.vendure.io/current/framework/core-concepts/payment>,
section "Custom payment flows").

## 2. `checkPaymentsCoverTotal`

Source: same file, `onTransitionStart` (lines 140–304); the payment gates
are lines 258–268:

- Option name `checkPaymentsCoverTotal` (default `true`) is defined in
  `default-order-process.d.ts:90` (`DefaultOrderProcessOptions`).
- **Entering `PaymentAuthorized`** (lines 259–264) requires _both_
  `orderTotalIsCovered(order, ['Authorized', 'Settled'])` — i.e. payments in
  either state sum to at least `totalWithTax` — _and_ at least one payment
  actually in the `Authorized` state.
- **Entering `PaymentSettled`** (lines 265–267) requires
  `orderTotalIsCovered(order, 'Settled')` — only `Settled` payments count.
  Note the asymmetry: an order whose payments are all `Authorized` can
  enter `PaymentAuthorized` but never `PaymentSettled`.

The coverage math lives in
`dist/service/helpers/utils/order-utils.js`:

- `orderTotalIsCovered` (lines 22–25): `totalCoveredByPayments(order,
state) >= order.totalWithTax`.
- `totalCoveredByPayments` (lines 29–43): sums `payment.amount` over all
  payments **not** in `Error`/`Declined`/`Cancelled` (or, when a state
  filter is given, only the listed states), minus the total of each
  payment's `Settled` refunds (lines 37–42).

**NUANCE vs the ADR:** the ADR says "authorized/settled payments must cover
the full total". True for the `PaymentAuthorized` gate; for
`PaymentSettled` only settled payments count. Also, the sums subtract
already-settled refunds, so refunding part of a payment can push an order
back out of full coverage for future transitions.

The same option also exists for the additional-payment flow:
`checkAdditionalPaymentsAmount` (`default-order-process.d.ts:43`, default
`true`) blocks **every exit** of `ArrangingAdditionalPayment` (lines
158–174) when `order.totalWithTax − totalCoveredByPayments(order) > 0`
(deficit computed at line 170) — except the exit to `Cancelled`, which is
explicitly allowed (lines 160–162). This is the "ArrangingAdditionalPayment's
exit guard demands full coverage" claim, confirmed.

The `Modifying` exit guard is `checkModificationPayments` (`default-order-process.d.ts:35`,
lines 142–157): leaving `Modifying` to anything other than
`ArrangingAdditionalPayment` requires every `OrderModification` to be
settled — with **zero modifications the check passes vacuously**
(`modifications.some(...)` over an empty array is false). This confirms the
ADR's "Modifying's exit guard is vacuous with zero modifications".

## 3. OrderPlacedStrategy / QuoteOrderPlacedStrategy

- Interface + docs: `dist/config/order/order-placed-strategy.d.ts` —
  `shouldSetAsPlaced(ctx, fromState, toState, order)`; the default places
  the order on `ArrangingPayment → PaymentAuthorized | PaymentSettled`.
- Default implementation: `dist/config/order/default-order-placed-strategy.js:11–18`.
- Wiring: `default-order-process.js` `onTransitionEnd` (lines 305–322) —
  when the strategy returns true: `order.active = false`,
  `order.orderPlacedAt = new Date()`, `orderPlacedQuantity` is stamped on
  each line, an `OrderPlacedEvent` is published, and seller orders are
  split via `OrderSplitter`.
- **This repo's config** (`backend/src/vendure-config.ts:106–110`):
  `QuoteOrderPlacedStrategy` returns true for `AddingItems →
ArrangingPayment`, so orders are placed the moment checkout submits and
  then sit in `ArrangingPayment`. It is wired at line 163
  (`orderPlacedStrategy: new QuoteOrderPlacedStrategy()`). The order
  process is `configureDefaultOrderProcess({
arrangingPaymentRequiresShipping: false })` (line 162) — every other
  default check (including `checkPaymentsCoverTotal`) stays on. Payment
  handlers: `paymentOptions: { paymentMethodHandlers: [] }` (line 172) —
  none registered yet.

Consequence: once a real payment handler lands and orders should be placed
on payment (the default behavior), the strategy must change — the ADR's
"Revisit when Barion lands" comment in the config says the same.

## 4. `addManualPaymentToOrder`

Source: `dist/service/services/order.service.js:1337–1383`.

- **State eligibility** (lines 1340–1342): returns
  `ManualPaymentStateError` unless
  `order.state === 'ArrangingAdditionalPayment' || order.state ===
'ArrangingPayment'`. Confirmed exactly as the ADR states.
- **Amount** (lines 1346–1350): the existing payments are loaded, then
  `amount = order.totalWithTax − totalCoveredByPayments(order)` — the
  outstanding deficit. The Admin API input `ManualPaymentInput` (admin-api
  schema, `order.api.graphql:277–282`) has only `orderId`, `method`,
  `transactionId`, `metadata` — **no amount field**. The caller can never
  record an arbitrary amount through this mutation; it is always the exact
  deficit.
  - In `ArrangingPayment` with no payments the deficit is the full total;
    in `ArrangingAdditionalPayment` it is whatever remains after the
    payments already on the order. **NUANCE vs the ADR:** the ADR presents
    the deficit computation as an `ArrangingAdditionalPayment` behavior;
    it applies in both allowed states. The practical implication stands:
    the 6 000 Ft deposit can only become a `Payment` on the order through
    the handler path (or a direct `PaymentService.createPayment` call),
    never through the manual-payment action — unless the deposit happens
    to equal the outstanding deficit at that moment.
- **Unsettled-modification consistency** (lines 1351–1362): if the order
  has unsettled `OrderModification`s, their summed `priceChange` must
  equal the computed amount or an `InternalServerError` is thrown. With
  no modifications (the normal placement-time case) there is no
  constraint.
- The payment is created via `PaymentService.createManualPayment`
  (`dist/service/services/payment.service.js:224–257`): a `Payment` with
  `method`/`transactionId`/`metadata` from the input, transitioned
  `Created → Settled` immediately, and added to `order.payments`.

## 5. Multiple payments per order are native

Confirmed on three levels:

- `Order.payments: Payment[]` (`dist/entity/order/order.entity.d.ts:96`).
- Coverage sums across all of them: `totalCoveredByPayments` iterates
  `order.payments` (order-utils.js:29–43) — deposit + remainder are two
  `Payment` rows and the guards see their sum.
- `addPaymentToOrder` (shop API, `order.service.js:1142–1207`) computes
  `amountToPay = totalWithTax − totalCoveredByPayments(order)` (line 1177)
  before creating the payment — i.e. the shop flow itself anticipates a
  second payment topping up the first.
- The Mollie plugin leans on this in production: it computes
  `alreadyPaid = totalCoveredByPayments(order)` and charges only the
  deficit, guards against double-payment by `transactionId`, and its
  docs-supported multi-payment flow is exactly "several Payments on one
  order" (`packages/mollie-plugin/src/mollie.service.ts`,
  `createPaymentIntent` / `handleMolliePaymentStatus`).

State eligibility for the _shop_ API's `addPaymentToOrder`:
`canAddPaymentToOrder` (`order.service.js:1320–1328`) allows
`ArrangingPayment` plus any state that can transition to **both**
`PaymentAuthorized` and `PaymentSettled` — under the default transitions
that means `ArrangingPayment`, `Modifying` and
`ArrangingAdditionalPayment` (notably **not** `PaymentAuthorized` itself,
since it cannot transition back to itself).

## 6. Payment entity surface (distinguishing two payments)

Source: `dist/entity/payment/payment.entity.d.ts`. A `Payment` carries:

- `method: string` — the payment-method code the payment was made with;
- `amount: number`, `state: PaymentState`, `transactionId: string`,
  `errorMessage`;
- **`metadata: PaymentMetadata`** — a free-form JSON column
  (`dist/common/types/common-types.d.ts:133–137`); any data under the
  `public` key is exposed through the Shop API, the rest is Admin-API-only
  (documented in the payment guide's handler example);
- `refunds: Refund[]`;
- `customFields: CustomPaymentFields` — `Payment` supports custom fields
  via the `customFields.payment` config key (`dist/entity/custom-entity-fields.d.ts:41`;
  the repo currently defines `Order` and `OrderLine` custom fields only,
  `backend/src/vendure-config.ts:216–238`).

So two payments on one order (Barion deposit vs COD remainder) can be
distinguished natively by any combination of `method` (separate
PaymentMethod entities / handler codes), `transactionId` (Barion
paymentId), and `metadata` (a purpose marker such as `deposit` /
`cod-remainder`); custom fields are available if a queryable column is
wanted. **UNVERIFIED beyond this:** whether the dashboard's order
payments list renders metadata usefully out of the box — that is UI
surface, not core source, and was not checked.

Payment states themselves: the `PaymentState` type is only
`'Created' | 'Error' | 'Cancelled' | keyof PaymentStates`
(`dist/service/helpers/payment-state-machine/payment-state.d.ts`);
`Authorized`, `Settled` and `Declined` come from
`defaultPaymentProcess`
(`dist/config/payment/default-payment-process.js:15–40`):
`Created → Authorized | Settled | Declined | Error | Cancelled`,
`Authorized → Settled | Error | Cancelled`, `Settled → Cancelled`,
`Cancelled` terminal. A `PaymentProcess` can add states the same way an
`OrderProcess` can.

## 7. Delivered: entry condition and irreversibility

- `Delivered.to = ['Cancelled']` — confirmed (default-order-process.js:92–94).
- **Entry into `Delivered` has exactly one native guard**, and it is
  fulfillment-based, not payment-based: `checkFulfillmentStates` (lines
  297–302) requires `orderItemsAreDelivered(order)` — every order line
  fully covered by `Delivered` fulfillments (order-utils.js:47–50). There
  is **no native payment-coverage condition on entering `Delivered`**.
  **NUANCE vs the ADR:** the ADR's "Delivered implies fully paid" is this
  repo's own invariant (achieved by ADR 0018's GLS worker rule "deliver
  only when payments cover the total" and by the owner's manual
  transition), not something Vendure enforces. Vendure would happily
  transition a partially-paid order whose fulfillments are all delivered
  into `Delivered` — the ordering of transitions is what keeps the
  invariant, so any state redesign must preserve that discipline
  explicitly.
- Entry into `Shipped`/`PartiallyShipped` is likewise fulfillment-gated
  (lines 279–290) — and note `ArrangingAdditionalPayment → Shipped` is a
  legal edge, so a partially-paid order in `ArrangingAdditionalPayment`
  can ship once fulfillments are shipped.

## 8. Cancellation, modification and refunds

- **Order cancellation touches no payments.** `OrderService.cancelOrder`
  (`order.service.js:1520–1537`) cancels order lines
  (`OrderModifier.cancelOrderByOrderLines`) and transitions the order to
  `Cancelled`; nothing in the default order process's
  `onTransitionStart`/`onTransitionEnd` cancels, refunds or settles
  payments on the way. Payments keep their states on a cancelled order;
  cleanup is the administrator's job via the mutations below.
- **`cancelPayment`** (admin API → `PaymentService.cancelPayment`,
  `payment.service.js:162–194`): invokes the handler's `cancelPayment()`
  and transitions the payment to `Cancelled` — this is the native path
  for releasing an `Authorized` (uncaptured) payment, which maps to
  Barion's `CancelAuthorization`.
- **`refundOrder`** (admin API → `OrderService.refundOrder`,
  `order.service.js:1557–1603` → `PaymentService.createRefund`):
  creates `Refund` rows and invokes the handler's `createRefund()`.
  Two hard gates matter for the deposit branch:
  - **Refunds are refused while the order is in `AddingItems`,
    `ArrangingPayment` or `PaymentAuthorized`** (`RefundOrderStateError`,
    `order.service.js:1592–1596`). A refund is only possible from
    `PaymentSettled` onward.
  - Refund targets must be **`Settled`** payments with refundable balance
    (`getRefundDestinations`, `order.service.js:1607+`: filters
    `p.state !== 'Settled'` out). An `Authorized`-only payment cannot be
    refunded through this flow at all — it can only be cancelled.
  - Refunds have their own state machine: `RefundState = 'Pending' |
'Settled' | 'Failed'` (`dist/service/helpers/refund-state-machine/refund-state.d.ts`),
    settled via `settleRefund` (`order.service.js:1666–1690`). Only
    _settled_ refunds reduce coverage (`totalCoveredByPayments`,
    order-utils.js:37–42).
- **Order modification** (`Modifying` state, entered via the
  `modifyOrder` mutation) can carry refunds/payments per modification
  (`OrderModifier`); the exit guards are the ones in claim 2. The ADR's
  reading of `Modifying` as "the order-modification flow whose recording
  action is not available there" is consistent: `addManualPaymentToOrder`
  refuses `Modifying` (claim 4), so recording a new payment inside
  `Modifying` is not possible — only through
  `ArrangingAdditionalPayment`.

## Docs layer: the sanctioned payment-provider patterns

Source: <https://docs.vendure.io/current/framework/core-concepts/payment>
(fetched 2026-11-15).

### Handler anatomy and the two-phase model

- A `PaymentMethodHandler` is defined with `code`, `args`, and the fns
  `createPayment` (invoked by the shop API's `addPaymentToOrder`),
  `settlePayment` (the `settlePayment` admin mutation), `cancelPayment`,
  `createRefund`, plus `onStateTransitionStart` (a guard run before every
  payment state transition — matches `payment-method-handler.d.ts:206–247`).
- Two-phase authorize/settle is the documented default: return
  `state: 'Authorized'` from `createPayment` and capture later in
  `settlePayment`; single-step flows return `'Settled'`. The docs
  explicitly extend the two-step model to payment-on-delivery:
  "authorization … on checkout, and the settlement step … triggered upon
  delivery, either manually by an administrator or via an app integration
  with the Admin API".
- The **order** auto-advances when payments cover the total: the docs say
  "If the Payment amount equals the order total, the Order is transitioned
  to either the `PaymentAuthorized` or `PaymentSettled` state". In source
  this is `defaultPaymentProcess.onTransitionEnd`
  (default-payment-process.js:56–70): after each payment state transition
  it transitions the order to `PaymentSettled` (if settled coverage is
  complete) or `PaymentAuthorized` (if authorized+settled coverage is
  complete) — unless the order is already in that state or in
  `ArrangingAdditionalPayment`.
- **Custom flows** are documented for exactly the case where the defaults
  do not fit: add a `PaymentProcess` state and a matching custom
  `OrderProcess` state (with `mergeStrategy: 'replace'` on the merged
  edges), plus a custom `OrderPlacedStrategy`. This is the documented
  route for the ADR's "custom states" option in question 1.

### Redirect / external-gateway flows

The docs' "Hosted payment pages" section describes the pattern Barion's
Responsive Payment Webpage matches:

1. the shop sends the buyer to the processor's URL,
2. the processor authorizes the payment,
3. the processor POSTs back to Vendure with payment details,
4. a pre-shared secret signs the cross-site POST.

The documented shape: "you would need to create a Controller to accept
POST redirects from the payment processor (usually a success and a failure
URL) … The validation of the POST request is done in the controller or
service and the payment amount and payment reference are just passed to
the payment handler which passes them on."

### The Mollie plugin as the reference implementation

The payment plugins now live in
<https://github.com/vendurehq/community-plugins> (`packages/mollie-plugin`;
the `vendureio/vendure-plugins` monorepo URL in the ADR is outdated — the
packages were extracted from the core monorepo, see the repo's
MIGRATION.md). Reading `src/mollie.plugin.ts`, `src/mollie.handler.ts`,
`src/mollie.controller.ts`, `src/mollie.service.ts` (fetched 2026-11-15):

- **Shape:** one NestJS controller (`@Controller('payments')`, route
  `POST /payments/mollie/:channelToken/:paymentMethodId`) registered via
  `VendurePlugin({ controllers: [...] })`, one handler pushed into
  `paymentOptions.paymentMethodHandlers` in the plugin's `configuration`,
  shop + admin API extensions for the `createMolliePaymentIntent` /
  `syncMolliePaymentStatus` mutations.
- **Redirect flow:** the shop-API mutation creates the provider payment
  with `webhookUrl` pointing at the controller and a `redirectUrl`
  (fallback configurable per payment method, order code appended); the
  provider's checkout URL is returned to the storefront.
- **Callback authenticity:** the webhook trusts **only** `body.id` as a
  pointer — it re-fetches the payment's status from the Mollie API and
  branches on that, never on the POST body. There is **no HMAC/signature
  verification** in the reference implementation; authenticity comes from
  "only a real Mollie payment id resolves". (Barion's optional
  HMAC-SHA-512 callback signing would be a strengthening over this
  baseline, matching the docs' "pre-shared secret" guidance.)
- **Handler state:** `createPayment` refuses to run for the shop API
  (`ctx.apiType !== 'admin' && ctx.apiType !== 'custom'` throws) — the
  webhook service calls `orderService.addPaymentToOrder` with an admin
  `RequestContext`, and the handler takes the **amount from the
  metadata** (the amount Mollie actually reported), not the passed-in
  `amount`. `transactionId` = provider payment id; the whole metadata
  blob (paymentId, method, mode, profileId, timestamps) is stored on the
  Payment.
- **Partial amounts and multi-payment:** `createPaymentIntent` computes
  `alreadyPaid = totalCoveredByPayments(order)` and creates the provider
  payment only for the deficit; duplicate payments are detected by
  `transactionId` and flagged for manual refund. The webhook path also
  transitions the order back into `ArrangingPayment`/
  `ArrangingAdditionalPayment` before adding the payment when needed.

### Plugin catalog — no Barion plugin

Confirmed 2026-11-15:

- The community-plugins package table lists: elasticsearch, braintree,
  mollie, stripe, sentry, stellate, pub-sub, punchout-gateway. No Barion.
- An npm registry search for "vendure barion" returns no Barion plugin —
  the only Barion-related package is `node-barion` 4.0.0 (the standalone
  SDK the ADR already records).

### Does Vendure sanction a Payment settling for less than the total?

No documented partial-settlement state exists, and nothing in the source
prevents the underlying facts:

- The handler decides the `amount` of the `Payment` it returns
  (`CreatePaymentResult.amount`, `payment-method-handler.d.ts:20–24`):
  "Typically this should equal the Order total, **unless multiple payment
  methods are being used for the order**" — multiple payments summing to
  the total is the documented, sanctioned shape. A handler can also
  simply return a smaller amount for a single payment (Vendure does not
  enforce `result.amount === amountToPay`); the Mollie plugin's
  metadata-driven amount is a working example of the amount diverging
  from the passed-in value.
- What the state machine enforces is only this: **the order's state may
  not advance past `ArrangingPayment` (or out of
  `ArrangingAdditionalPayment`) until the payments cover
  `totalWithTax`**. A partially-paid order therefore stays in a
  pre-payment state (`ArrangingPayment` under defaults) — there is no
  native "partially settled" resting state, and the docs never describe
  one.
- The documented answer for a flow that needs a resting state at partial
  payment is a custom `OrderProcess`/`PaymentProcess` state (the
  custom-payment-flows section) — which is exactly the design space ADR
  0020's question 1 is exploring.

## Implications for ADR 0021

The evidence constrains ADR questions 1–3 as follows:

1. **Question 1 (which states accept partial payment).** Under the
   defaults the only resting state for a partially-paid order is
   `ArrangingPayment` — every later state's entry or exit is
   full-coverage-gated (`PaymentAuthorized`/`PaymentSettled` entry,
   `ArrangingAdditionalPayment` exit), except `Modifying`, whose exit is
   vacuous with zero modifications but whose recording action is
   unavailable. So the deposit branch either (a) stays parked in
   `ArrangingPayment` until the remainder is recorded — but then the
   order cannot ship, because `ArrangingPayment.to` has no fulfillment
   states and `checkFulfillmentStates` gates `Shipped` entry — or (b)
   relaxes/redirects the coverage guards (`checkPaymentsCoverTotal`,
   `checkAdditionalPaymentsAmount` are per-option toggles on
   `configureDefaultOrderProcess`) and/or adds a custom state via the
   documented `OrderProcess` mechanism. Any custom state must decide the
   full consequence matrix of ADR question 1 itself (cancel, modify,
   ship, dashboard, GLS worker), because Vendure enforces nothing beyond
   the guards above; in particular **entering `Delivered` is not
   natively payment-gated** — the "fully paid" half of the invariant is
   ours to keep enforcing.
2. **Question 2 (distinguishing the two payments).** No design work is
   forced by the core: `Payment.method`, `transactionId` and `metadata`
   (with a Shop-API-visible `public` portion) already distinguish a
   Barion deposit from a COD remainder, and `customFields.payment` is
   available for queryable structure. The Mollie plugin's metadata
   pattern (store the provider's payment id plus status/timestamps on
   the Payment) is the reference to copy. The refund surface is
   state-sensitive, though: only `Settled` payments are refundable via
   `refundOrder`, and refunds are refused entirely while the order is in
   `PaymentAuthorized` — an `Authorized` deposit is cleaned up with
   `cancelPayment` (→ Barion `CancelAuthorization`) instead. That
   asymmetry belongs in the answer to question 2 and in the refund/
   chargeback policy (question 12).
3. **Question 3 (the settle-on-delivery leg).** The ADR's proposed path
   `PaymentAuthorized → ArrangingAdditionalPayment →
addManualPaymentToOrder → PaymentSettled` is sound in source: the
   direct edge exists (default-order-process.js:69–71), entry into
   `ArrangingAdditionalPayment` from `PaymentAuthorized` has **no native
   guard** (the additional-payment checks only run when _leaving_ the
   state, and the `Modifying`-entry check only applies when coming _from_
   `Modifying`), the manual-payment action is legal there and computes
   the exact deficit, and the exit guard then demands full coverage —
   which the recorded remainder satisfies. The `Modifying` hop is only
   needed when the order is already past `PaymentAuthorized` (e.g.
   `Shipped`, whose `to` list lacks both `ArrangingAdditionalPayment` and
   `PaymentSettled`): there the zero-modification vacuous exit makes
   `Shipped → Modifying → ArrangingAdditionalPayment → PaymentSettled`
   work, as ADR 0018 recorded. One constraint to carry into the design:
   `addManualPaymentToOrder` can never record an _arbitrary_ amount —
   only the exact deficit — so the 6 000 Ft deposit itself must be
   created through the payment handler (or `PaymentService.createPayment`),
   exactly as the Mollie webhook path does with its admin
   `RequestContext`.
