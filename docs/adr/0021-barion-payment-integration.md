# ADR 0021 — Barion payment integration

Status: **draft** — a record of what we know, the decisions made so far
and the questions that remain. It becomes a proposal when the open
questions in the last section have answers.

Every external claim in this file is grounded claim-by-claim in three
evidence documents, each written against primary sources on 2026-11-15:
[docs/barion-api.md](../barion-api.md) (docs.barion.com, via dated Wayback
snapshots), [docs/vendure-payments.md](../vendure-payments.md) (the
installed Vendure 3.8.1 source, `file:line`) and
[docs/szamlazz-api.md](../szamlazz-api.md) (docs.szamlazz.hu and the
invoice-request XSD). Where grounding contradicted an earlier reading, the
text below already reflects the corrected fact.

Part of epic 7 (Barion payment provider, tax, NAV invoicing). The owner's
post-order flow this serves is recorded in
[docs/roadmap.md](../roadmap.md) (Owner post-order flow).

## Context

Today no payment is native. Orders stop at `ArrangingPayment` (the
`QuoteOrderPlacedStrategy` marks them placed — ADR 0013 decision 5);
prod (2026-11-13) holds placed orders, 0 payments. Epic 6 has since added
the multi-step checkout with the structured address and the Számlázás step
(billing address), so the checkout is ready for a payment
step.

The owner's post-order flow branches on the payment method the buyer chose
at checkout:

- **Előre utalás / prepaid** — the buyer pays the full total (today: bank
  transfer against a díjbekérő; after epic 7: Barion at placement).
- **Utánvét (COD) / Személyes átvétel** — the buyer pays a fixed
  **6 000 Ft deposit** at placement, the owner issues an előlegszámla, and
  the **remainder is collected physically on delivery**; the végszámla with
  the deposit set-off (előleg beszámítása) is issued when the product is
  done.

Today everything after the order email is manual: the owner issues
díjbekérők in Számlázz.hu, **AutoKassza pairs the bank transfer with the
díjbekérő and notifies her**, she issues the invoice(s) and saves the GLS
label ([ADR 0020 — GLS labels](0020-gls-labels-via-mygls-api.md)).

## What we know about Barion (verified 2026-11-13, re-grounded 2026-11-15)

Sources: docs.barion.com (Payment-Start-v2, Responsive web payment,
Sandbox, Making a test payment, FundingSources, Callback mechanism,
Barion Shop Authentication, Supported currencies, List of API endpoints,
Going live, Security Measures) — full per-claim citations in
[barion-api.md](../barion-api.md).

### The API

- Public REST API (Barion Smart Gateway). Payments on
  `POST /v2/Payment/Start` — required: `POSKey`, `PaymentType`,
  `GuestCheckOut`, `FundingSources`, `PaymentRequestId`, `RedirectUrl`,
  `CallbackUrl`, `Transactions[]`, `Currency`, `Locale`; authoritative
  state on `GET /v4/payment/{paymentId}/paymentstate`, which
  authenticates with an `x-pos-key` request header unlike v2's body
  `POSKey` (the v2 `GetPaymentState` is deprecated); `FinishReservation`,
  `Capture`, `CancelAuthorization`, `Refund` for the
  reservation/capture/refund surface.
- Auth is the shop's POSKey (GUID), sent in the request body on v2
  endpoints. HMAC-SHA512 signing of requests and of Barion's callback
  messages (`x-timestamp`/`x-nonce`/`x-signature-sha512`) is opt-in — but
  once the key is activated Barion rejects every unsigned request and
  signs its own callbacks; server clocks must agree within 5 minutes and
  old keys keep being accepted for 24 h after rotation. Documented in the
  official PHP library and the Barion Shop Authentication page (not
  Security Measures).
- Flow: `Payment/Start` (`PaymentType: Immediate | Reservation |
DelayedCapture`, `Transactions[]` with `Payee`, `Total`, `Items`) → the
  response carries `GatewayUrl`, the buyer pays on `secure.barion.com`,
  is redirected back with the paymentId. Optional `PaymentWindow`
  (default 30 min, max one week) caps how long the buyer may sit on the
  gateway; expired payments become `Expired`. Barion POSTs a callback to
  `CallbackUrl` on every state change — a signal only (`paymentId`);
  respond HTTP 200 within 15 s, Barion retries 5 times (2/6/18/54/102 s)
  and then emails the shop. Callbacks require TLS 1.2+ (TLS 1.3 not yet
  supported) from documented per-environment IPs; querying PaymentState
  for the same payment more than once per 5 s returns 429. Flooding the
  API instead of relying on callbacks may get the shop suspended — while
  the docs _prescribe_ bounded fallback polling (after redirect and after
  window expiry). The callback's state is never trusted — the server
  re-queries `PaymentState` and branches on that. Idempotency keys are
  supported on requests (relevant for `Payment/Start` retries).
- `Payment/Start` accepts 3DS-related payer data (name, e-mail, phone,
  shipping address); sending it raises SCA pass rates.
- **A Reservation charges the buyer immediately** — for card payments the
  money moves to the merchant's wallet and stays reserved _there_ (not
  held on the card) for up to 365 days; `FinishReservation` takes
  per-transaction amounts, a partial finish releases the finished part
  and auto-refunds the rest, and finishing is possible per transaction
  across the whole window. If the payer's card is dead by finish time the
  auto-refund fails: the merchant keeps the full amount and owes the buyer
  a manual refund. Reservation fees are reserved in the merchant wallet at
  `Payment/Start` time — the wallet must be funded up front.
  `DelayedCapture` (hold on the card, single-shot capture, 7 days /
  21 days for Hungarian shops, card-only) is too short for made-to-order
  lead times. The gateway UI is identical across all three payment types.
- Refunds: `POST /v2/Payment/Refund` on `Succeeded` payments, full or
  partial per transaction; the payment stays `Succeeded` — the refund
  rides its own refund-type transactions. `CancelAuthorization` exists
  for releasing holds.

### Payment methods

Per-payment `FundingSources` flags:

| Value          | Method                | Notes                                                                                  |
| -------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `Balance`      | Barion wallet balance | cannot be disabled                                                                     |
| `BankCard`     | Bank card             | guest or Barion user                                                                   |
| `GooglePay`    | Google Pay            | guest only, capable devices; **gated by the merchant's contract**, not the API call    |
| `ApplePay`     | Apple Pay             | guest only, capable devices; same contract gate                                        |
| `BankTransfer` | Online bank transfer  | ⚠️ "no longer supported" as of 2026-01-09, replacement still being sought (2026-11-15) |

No PayPal, no iDEAL. QR Platba is CZK-only. The deprecated bank-transfer
source confirms the roadmap's design: the bank-transfer branch stays
manual (díjbekérő → AutoKassza), outside Barion.

### Currencies

HUF, EUR, CZK, USD, RON, PLN — one per payment, and the merchant's wallet
must hold an account in that currency. Minimums apply (HUF 10 Ft; EUR
0.1 €, USD $0.1, CZK 1 Kč — RON/PLN minimums and decimal precision are
undocumented; verify before epic 9). HUF has no decimal digits (matches
`ForintMoneyStrategy`).

### Test environment

- `api.test.barion.com` + `secure.test.barion.com`; a completely separate
  environment from production (separate wallet, nominal funds only).
- Self-serve (unlike GLS): register, create a shop, the POSKey is
  generated automatically and sandbox shops are approved automatically
  (live shops need human approval).
- Card payments are a simulator: any future expiry, any CVC. The
  per-currency minimums apply in tests too. Each `ProcessResult` has a
  dedicated test card (success, decline, fraud, SCA-soft-decline) — see
  [barion-api.md](../barion-api.md) §8.
- Recurring/token payments are enabled by default in the sandbox.

### SDK and plugin landscape

- No official Node SDK (official libraries are PHP and mobile).
- Community `node-barion` (npm, MIT, v4.0.0, 2026) covers the full
  gateway surface.
- **No Vendure Barion plugin exists** (GitHub and the Vendure plugin
  catalogs: nothing; re-checked 2026-11-15) — the integration is a custom
  `PaymentMethodHandler` + callback controller, written from scratch; the
  Mollie plugin is the closest behavioral reference (now at
  `vendurehq/community-plugins`, `packages/mollie-plugin` — the old
  `vendureio/vendure-plugins` monorepo is gone). Its webhook trusts only
  `body.id` and re-queries the provider; Barion's optional HMAC signing
  would exceed that baseline.

### Onboarding

- Online registration is the contract (no paperwork); every live shop
  gets human approval, with full KYC kicking in at limits or staff
  decision (AML). Business wallets start with reduced limits until full
  due-diligence; the gateway keeps working either way (UNVERIFIED —
  plausible but not stated in the docs).
- Fees are package-based (barion.com price calculator), deducted from the
  merchant balance after each payment.
- Recurring/token payments need a separate advance approval ("only
  available for trustworthy companies").
- Payer and payee must differ (the merchant cannot pay in her own shop).

## What we know about ourselves (verified constraints)

- **The order state machine blocks partial settlement** (verified in
  [ADR 0020 — GLS labels](0020-gls-labels-via-mygls-api.md), Vendure
  3.8.1): `checkPaymentsCoverTotal` requires
  authorized/settled payments to cover the full total before
  `PaymentAuthorized`/`PaymentSettled`; `Delivered.to = [Cancelled]`;
  `ArrangingAdditionalPayment`'s exit guard also demands full coverage
  (the settle leg goes through `Modifying`). The 6 000 Ft deposit alone
  can therefore not reach any settled state at placement.
- **`Delivered` keeps its condition (owner, 2026-11-13):** fully paid and
  physically delivered — the GLS "delivered" status alone never marks the
  order `Delivered` because `Delivered` is not reversible. That means
  **partially paid orders must be representable in the states before
  `Delivered`** (the deposit branch spends its whole life there: deposit
  paid at placement, remainder collected on delivery). Grounding note
  (2026-11-15): Vendure's native guard on entering `Delivered` checks
  only fulfillments — "fully paid" is this repo's own invariant, enforced
  by the GLS worker's deliver-when-settled rule ([ADR 0020 — GLS
  labels](0020-gls-labels-via-mygls-api.md)) and the
  owner's manual transition, so any state redesign must carry that
  discipline explicitly. Which earlier states accept partial payment, and
  what each of them must therefore allow, is not yet known — see
  question 1.
- **The deposit is an invoice-flow fact, not just a payment amount:** the
  6 000 Ft exists because the owner issues an előlegszámla for it, and
  the végszámla only when the product is done. The amount of the Barion
  payment and the invoice branch are the same decision.
- **Számlázz.hu's auto-előlegszámla is constrained, not unusable**
  (grounded 2026-11-15; supersedes the earlier per-account reading): the
  on/off switch is account-level and fires only on AutoKassza/online
  settlements — a díjbekérő manually marked paid produces no automatic
  invoice — but the document type the auto-invoice gets (előlegszámla vs
  normál számla) is configured **per invoice prefix (előtag)**. Branches
  separated by prefix therefore get correct invoice types automatically;
  the rule still applies to _every_ paid díjbekérő on that prefix. See
  question 5.
- **The COD remainder's money confirmation is bank-side:** AutoKassza
  pairs the bank statement line via the parcel's `CODReference`
([ADR 0020 — GLS labels](0020-gls-labels-via-mygls-api.md)) and notifies the owner. There is no hook from that notification
  into the backend today; GLS's own statuses are only a proxy for the
  money.
- **Manual payments are only addable in two states** (verified
  2026-11-13, re-verified in source 2026-11-15,
  `OrderService.addManualPaymentToOrder`): the dashboard's
  manual-payment action returns `ManualPaymentStateError` unless the
  order is in `ArrangingPayment` or `ArrangingAdditionalPayment`. Three
  consequences: the bank-transfer branch works today _because_ orders
  sit in `ArrangingPayment`; once the deposit moves an order to
  `PaymentAuthorized`, the COD remainder can be recorded only after the
  order enters `ArrangingAdditionalPayment`; and **the mutation has no
  amount input — it always records the outstanding deficit
  (`totalWithTax − totalCoveredByPayments`), in both allowed states** —
  so the 6 000 Ft deposit can never be recorded through it. The deposit
  must become a `Payment` through the payment-handler path (the Mollie
  plugin's admin-`RequestContext` webhook pattern is the reference).
- **Refunds and cancellations are state-sensitive** (verified in source
  2026-11-15): `refundOrder` is refused while the order is in
  `AddingItems`, `ArrangingPayment` or `PaymentAuthorized`
  (`RefundOrderStateError`) and targets only `Settled` payments — an
  `Authorized`-only deposit is released via `cancelPayment` (the
  handler's `cancelPayment()`, mapping to Barion `CancelAuthorization`),
  not refunded. Order cancellation touches no payments at all — cleanup
  is the administrator's job.
- **Multiple payments per order are native** (same code path): the
  coverage guard sums across all `Payment` rows, so deposit + COD
  remainder can be two `Payment`s on one order — only their labeling
  (handler / metadata) is ours to design (question 2).
- **A complete state path exists for the deposit branch, but it leans on
  guard quirks** (all verified in the 3.8.1 source, re-verified
  2026-11-15): `ArrangingPayment → PaymentAuthorized` needs
  `checkPaymentsCoverTotal` relaxed (the 6 000 Ft deposit alone cannot
  cover); `PaymentAuthorized → Shipped` has no direct edge — the working
  hop is through `Modifying`, whose exit guard is vacuous with zero
  modifications, because `ArrangingAdditionalPayment`'s exit demands
  full coverage; the COD remainder then records inside
  `ArrangingAdditionalPayment` (see above) and the order settles. The
  grounding adds the fact that settles question 1's baseline: under the
  default guards a partially-paid order's only resting state is
  `ArrangingPayment`, and **from there it cannot ship**
  (`ArrangingPayment.to` has no fulfillment states) — parking is not a
  viable option; the choice is guard relaxation or a custom state.
  Question 1 must decide between them.
- **The Meta purchase-tracking note (roadmap design note)** applies: once
  Barion redirects buyers to the gateway, the honest Purchase signal is a
  server-side event on payment confirmation, and the attribution handle
  must ride the order.

## Consequences we are already committed to

These are not questions — they follow from what was verified:

- **Epic 7 cannot be worked in isolated slices.** Barion, the
  Számlázz.hu invoice flow and the payment-confirmation notification are
  one design: the deposit branch makes the Barion payment amount, the
  invoice branch and the COD settle trigger the same problem. Slices are
  possible for rollout, not for design.
- **The bank-transfer branch stays outside Barion.** The funding source
  is deprecated; the branch is díjbekérő → AutoKassza → owner records
  the payment (native manual-payment action) as the roadmap already
  sketches.
- **Development happens against the sandbox.** Unlike GLS, it is
  self-serve, so the sandbox integration can start as soon as the
  questions below are answered.
- **A custom payment method handler + callback controller is the only
  Vendure plugin path.** Nothing to buy or adopt; a small typed client
  (the [ADR 0020 — GLS labels](0020-gls-labels-via-mygls-api.md)'s
  GLS-client pattern) or `node-barion` — an implementation
  choice, not a design question. Whether a custom handler is needed _at
  all_ was question 19 — **decided 2026-11-22 (see "Decisions")**: the
  custom handler is built; Számlázz.hu's Online fizetés is rejected as
  the architecture (it may still serve as a fallback re-payment channel
  later).

## Decisions (2026-11-22)

Made with the owner honing the use-cases; the grounding documents above
constrain them.

### The delivery × payment model

Delivery and payment split into orthogonal dimensions. The matrix below
is the current *product* of the dimensions — the implementation must
compose them, never enumerate pairs.

Delivery variants (Vendure `ShippingMethod`s; the GLS parcel shop is a
future row):

| Delivery variant                   | Payment arrangement                                   |
| ---------------------------------- | ----------------------------------------------------- |
| GLS házhozszállítás                | full prepay (Barion or bank transfer)                 |
| GLS házhozszállítás utánvéttel     | **6 000 Ft deposit** now, rest collected by GLS       |
| Személyes átvétel Telkibányán      | full prepay (Barion or bank transfer)                 |

- **COD stays its own GLS shipping method** (`gls-utanvet`): the GLS
  worker already reads the method code and sends
  `cashOnDelivery: { amount: outstanding, reference: order.code }` on
  the label — keeping the variant preserves that with no GLS-side rework.
- **Personal pickup is full-prepay only.** A deferred pickup variant was
  considered and dropped (owner, 2026-11-22); the arrangement axis below
  makes re-adding it a new variant row, not a redesign.
- **The payment step offers exactly two methods**: **Barion** (card
  guest + Barion wallet balance at first ship; Google/Apple Pay ride the
  merchant contract, question 14) and **bank transfer** (buyer-selectable
  — see below). The payable amount derives from the selected delivery
  variant's arrangement: full total, or the deposit.

### The payment arrangement is an axis, not a method

- *Full-now* vs. *deposit-now + rest-at-handover* is a **capability of
  the delivery variant** (a shipping-method custom field), not a payment
  method and not an enumerated pair. New delivery options declare the
  flag and immediately work with every payment method.
- **The 6 000 Ft deposit is arrangement-scoped data with a single
  source** — not hardcoded per consumer (GLS worker, checkout copy,
  invoice builder all read it from one place). It will most likely
  differ per channel when the shop expands (owner, 2026-11-22), so the
  modeling must be channel-ready from the start (epic 9, question 18).
- A payment method that cannot serve an arrangement (if one ever
  appears) is excluded by a declarative eligibility rule against the
  arrangement, never by forking methods or deleting matrix cells.
- **The deposit order-state path must not branch on payment method**
  (owner, 2026-11-22): once a payment is recorded on the order, every
  form of payment is equivalent — the custom state machine, the GLS
  worker's deliver-when-settled rule and the invoice triggers behave
  identically whether the deposit arrived via Barion or AutoKassza/IPN.

### Questions 1–3: the custom-payment-flows route

Decided (owner, 2026-11-22): **go with the Vendure docs' recommended
route** — a custom `OrderProcess` state (the documented custom states +
`mergeStrategy` mechanism, custom `OrderPlacedStrategy` as needed) for
the partially-paid deposit branch. Guard relaxation
(`checkPaymentsCoverTotal` / `checkAdditionalPaymentsAmount` toggles)
is the fallback only if implementation hits considerable snags. The
state-by-state consequence matrix of question 1 (cancel, modify, ship,
dashboard, GLS worker) remains an implementation deliverable.

### Questions 9/15/18: checkout shape (partial)

- The checkout payment list is **Barion + bank transfer**; funding
  sources inside the Barion gateway are card + wallet at first ship.
- The deposit disclosure appears when a deferred variant is selected;
  the amount comes from the arrangement data (question 15's remaining
  UX detail is open).
- The deposit rides the deferred delivery variant, not GLS as such
  (question 18's per-market modeling lands at epic 9).

### Invoice triggers

Documents fire on **(payment arrangement, confirmation event)** — two
axes — never on delivery×payment pairs:

| Event                                                  | Document fired                        |
| ------------------------------------------------------ | ------------------------------------- |
| Barion full payment confirms (any prepaid variant)     | számla (paid, `fizmod` = bankkártya)  |
| Bank transfer settles (AutoKassza → IPN)               | számla                                |
| 6 000 Ft deposit confirms (Barion or transfer, COD)    | előlegszámla                          |
| Owner marks the product finished (COD branch)          | végszámla with deposit set-off        |

Automation is decided (owner, 2026-11-22): the backend issues via the
Számla Agent on our own payment events; the demand-document seam is
decided (díjbekérő iff the payment option is not self-demanding, form
owned by the payment option — see Q5); Számlázz.hu delivers the
díjbekérő email on bank-transfer branches.

### Bank transfer as a buyer-selectable option

The existing `bank-transfer` handler flips from owner-only recording to
a real checkout option: the buyer picks átutalás, the order parks in
`ArrangingPayment`, and a díjbekérő carries the bank details and the
payment reference to the buyer. The reference convention (proposal):
**the order code everywhere** — the GLS label already sends
`order.code` as `clientReference` and COD reference, so one reference
across díjbekérő, GLS and bank statements makes AutoKassza pairing and
IPN correlation trivial.

### Build vs. adopt (Q19/Q5) — the custom handler (2026-11-22)

**Decided: build the custom Vendure Barion handler.** The owner's
criterion is control: control on the site and on Vendure, every external
API integrated as a plugin/service (the GLS-plugin pattern), and a real
Barion payment handler on the checkout page. Számlázz.hu's Online
fizetés — whose díjbekérő → auto-invoice → IPN chain would come for free
— is rejected as the architecture because the buyer would pay through
Számlázz.hu's own page: no in-checkout redirect, no `Payment/Start`-level
payer data for 3DS pass rates, no deposit collection at placement, no
payment metadata on the order. It may return later as a *fallback
re-payment channel* (e.g. gateway abandonment), not as the architecture.

This collapses Q5's route fork: with our own payment events, invoice
automation means **the backend issues via the Számla Agent** (the
per-prefix auto-invoicing setting can never fire — our payments settle
in the Barion wallet, not in Számlázz.hu). The open remainder of Q5 is
mechanics, not route: whether the díjbekérő is still issued at placement
for Barion branches, and the exact document sequence per event (the
Agent supports issuing documents already marked paid via `<fizetve>` and
recording payments via the credit entry, so both shapes are available).

### Rate limits — hard constraints for the implementation

The implementation must respect these as design constraints, not
runtime discoveries — pacing, bounded retries and serialization are
built in from the start:

- **Számlázz.hu Számla Agent** ([szamlazz-api.md](../szamlazz-api.md)
  §1): the test environment documents a hard limit (max 500 invoices /
  10 minutes); production publishes **no number** — only behavioral
  guidance: never loop failed requests, at most **5 attempts for the
  same request**, and repeated excess load can lead to a ban. Document
  issuance and the reconciliation sweep therefore pace themselves,
  never retry in loops, and lean on the Agent's own idempotency
  (`rendelesSzam` duplicate protection, errors 71/152) instead of
  guess-and-retry.
- **Barion** ([barion-api.md](../barion-api.md) §3, §14): PaymentState
  re-queries for the same `paymentId` more than once per 5 s return
  **HTTP 429** for the following 5 s; "flooding the Barion servers with
  unnecessary API calls, instead of relying on the callback mechanism,
  may lead to suspension of the shop"; the callback ACK budget is 15 s
  (retries at 2/6/18/54/102 s, then email). Implementation: per-payment
  query serialization, a single re-query per callback, bounded fallback
  polling only where the docs prescribe it (after redirect, after
  window expiry).

## Questions to answer before starting

We do not start until every question here has an answer. The list is the
work plan for the refinement phase.

### Order state (the deposit problem)

The `Delivered` invariant is fixed (fully paid and physically delivered —
see the verified constraints); the design question is the states before
it. **Route decided 2026-11-22** — see "Decisions".

1. **DECIDED (2026-11-22) — route fixed, matrix is an implementation
   deliverable.** The deposit branch goes through a custom order state
   per the documented custom-payment-flows mechanism (see "Decisions").
   What remains: enumerate the states from placement to `Delivered`,
   decide which accept partially paid orders, and lock down, per state:
   cancellation (and the deposit's refund path), modification,
   onward transition, dashboard display and GLS-worker behavior. States
   that stay full-payment-only must refuse the deposit branch
   explicitly, not silently.
2. **DECIDED (2026-11-22): three payment-method codes with a shared
   `metadata.role` marker.** `barion` (any gateway payment — full total
   or deposit; `transactionId` = Barion `paymentId`), `bank-transfer`
   (buyer transfer recorded via IPN/owner — prepaid full or COD
   deposit; `transactionId` = the pairing reference, `metadata` carries
   the díjbekérő number), `cod-remainder` (the settle-on-delivery
   recording, manual action, amount = the deficit; `transactionId` =
   the GLS remittance/pairing reference). Every payment's `metadata`
   carries `role: "full" | "deposit" | "remainder"` — the invoice
   builder, the refund flows and the dashboard branch on **`role`**,
   not on the method code (method is payment-option-owned, role rides
   the arrangement axis — the seams compose). No new payment custom
   fields until a dashboard query need proves otherwise; the stock
   dashboard's metadata rendering is UNVERIFIED (UI surface) — a small
   dashboard extension is the fallback. Refund asymmetry note: with
   `Immediate` everywhere, Barion payments settle at confirmation, so
   `refundOrder` (needs `Settled` payments) is the normal path for full
   payments and deposits alike; the `cancelPayment` →
   `CancelAuthorization` path stays reserved for future two-phase
   methods.
3. **DECIDED (2026-11-22).** *Settle leg:* the verified path stands —
   `PaymentAuthorized → ArrangingAdditionalPayment →
   addManualPaymentToOrder (amount = the deficit) → PaymentSettled` —
   sound in source ([vendure-payments.md](../vendure-payments.md)
   implications §3), with the standing caveat that the manual-payment
   action records only the exact deficit, so the 6 000 Ft deposit
   itself enters through the handler path. *Fulfillment-started
   boundary:* a **custom-field flag `fulfillmentStartedAt`** on the
   order, set by a dashboard action when the owner starts making the
   product (her definition spans production and shipping; made-to-order
   throughout — "ready-made" means materials at hand). The
   refund-policy check reads this flag; naming note: Vendure core
   "fulfillment" means shipping only — the flag is ours and means the
   owner's broader sense. *Failed delivery:* a **custom `Returned`
   state**, entered automatically when the GLS worker sees the parcel
   returned/error (no auto-cancel — the automatic act is flagging);
   owner-chosen exits from `Returned`: → `Cancelled` (deposit kept per
   Q12, előlegszámla untouched) or → back into the fulfillment path
   (re-fulfill after talking to the customer). `Cancelled` stays
   terminal — no custom edge out of it. *Delivered but remainder never
   confirmed:* a flagged resting state (the deliver-when-settled rule
   keeps it out of `Delivered`); the remittance-lag threshold before
   flagging needs grounding (owner knowledge → GLS docs → GLS support
   as last resort); chasing a buyer who claims she paid the courier is
   a manual, human settlement — nothing on Vendure.

### Invoicing (Számlázz.hu)

4. ~~What does the Számlázz.hu API support of what the flow needs?~~
   **ANSWERED** ([szamlazz-api.md](../szamlazz-api.md) §2–4): the Számla
   Agent supports díjbekérő, előlegszámla, végszámla (exactly one per
   előlegszámla; set-off pairing via `rendelesSzam` or
   `<elolegSzamlaszam>`), stornó, line-itemized documents, an explicit
   `<fizetesiHataridoDatum>`, and registered prefixes via
   `<szamlaszamElotag>`. Payment method (`<fizmod>`, free text) is fixed
   at creation — no edit-after-issue; a mismatch means storno + reissue.
   Design constraints this adds: the backend must stamp
   `rendelesSzam`/`szamlaKulsoAzon` for correlation, and the
   átutalás↔utánvét choice happens before issuing, not after.
5. **DECIDED (2026-11-22) — see "Decisions" (Build vs. adopt).** When a
   Barion payment succeeds, the backend issues the branch-appropriate
   document via the Számla Agent (számla / előlegszámla, already marked
   paid); no díjbekérő on self-demanding (Barion) branches, díjbekérő
   owned by the payment option elsewhere, Számlázz.hu delivers its
   email on bank-transfer branches. One UNVERIFIED remainder: whether
   Számlázz.hu's email wrapper text localizes per document language.
6. ~~Where does NAV/online-számla and the 27% ÁFA setup interact with
   this?~~ **LARGELY ANSWERED** ([szamlazz-api.md](../szamlazz-api.md)
   §7): NAV reporting is automatic once the account's NAV technical user
   is connected; 27% is the per-line `<afakulcs>` value the backend
   sends (the Agent does no math); a Barion payment changes only the
   `fizmod` string we choose. One UNVERIFIED remainder: whether NAV's
   Online Számla spec constrains the fizetési-mód value for card
   payments (a NAV-spec question, not Számlázz.hu's).

### Payment-confirmation notifications (AutoKassza)

7. ~~Does Számlázz.hu or AutoKassza expose an API/webhook for payment
   pairing or díjbekérő payment events?~~ **ANSWERED — yes**
   ([szamlazz-api.md](../szamlazz-api.md) §6): the Számlázz.hu **IPN**
   POSTs on every paid-amount change of a számla _or díjbekérő_
   (including AutoKassza pairings and partial payments), carrying the
   document number, the parent díjbekérő's number, the order number, the
   _cumulative_ paid amount and the payment method. Trust model:
   unsigned (secret-in-URL + IP allowlist; verify by re-querying via
   `action-szamla_agent_xml`); any non-200 response drops the IPN
   permanently (only missing responses retry — 11 attempts, 5-day
   horizon); duplicates collapse to the newest state per document.
   AutoKassza itself has no standalone API (negative result, search
   trail in §6.3); the heavier Pénzügyi adatkapcsolat (#profi) pushes
   raw bank transactions but carries no pairing reference.
8. **DECIDED (2026-11-22): adopt the IPN as a payment-confirmation
   source.** The receiver records bank-transfer payments on the order
   automatically (prepaid and COD deposit alike — the deposit order-state
   path is payment-method-agnostic per "Decisions"). Grounded design
   constraints: idempotent on **cumulative** amounts (overwrite, never
   add — duplicates collapse to the newest state per document), verify by
   re-querying the document via `action-szamla_agent_xml`, and never
   return a non-200 on processing failure (any non-200 drops the IPN
   permanently; only connection failures retry — 11 attempts, 5-day
   horizon). Trust: unsigned POST — secret token in the URL, Számlázz.hu
   sender-IP allowlist, and the re-query as the real check.
   **Crucial corollary (owner, 2026-11-22): push is never the sole
   source of truth — but it is the fast path.** The IPN is processed
   immediately on ack; the reconciliation sweep exists for our own
   uncertainty, not as standing distrust of Számlázz.hu. Sweep triggers:
   (a) startup after our downtime (watermark check), (b) our own
   processing failures, (c) deadline passing, (d) a low-frequency safety
   net over payment-relevant states only. For every such order, re-query
   its documents via `action-szamla_agent_xml` (by `rendelesSzam` /
   `szamlaKulsoAzon`) and reconcile the `<kifizetesek>` block against
   recorded payments — idempotently, through the same apply-state
   function the IPN receiver uses. Volume is structurally bounded:
   Számlázz.hu has **no list endpoint**, so only documents we can name
   are queryable — the sweep walks our order list (our DB is the index),
   a handful of orders at a time, paced per their behavioral guidance
   (max 5 attempts per request, no loops, ban risk). This catches IPNs
   lost to our downtime (including past the 5-day retry horizon),
   partial payments, and deadline-passed unpaid orders (flagged for the
   owner). Known blind spots, accepted by the owner (2026-11-22):
   documents we didn't issue (owner's manual ones — unresolvable IPNs
   are logged; the owner handles manual documents and order states by
   hand), and bank lines AutoKassza never paired (flagged when a
   deadline passes unpaid; recoverable manually on both sides — the
   dashboard's manual-payment action takes a transaction reference, and
   the Agent's credit entry can mark the document paid). The same
   pattern is mandated on the Barion side: `PaymentState` v4 is
   authoritative per `paymentId`, and bounded fallback polling is
   prescribed by Barion's docs (its 429 limit is per payment, 1 query /
   5 s) — two sweeps, one reconciliation function, our DB indexing both.

### Barion-side choices

9. Which funding sources do we enable at first ship (card only?
   +wallet? Google/Apple Pay depending on the merchant contract), and
   what does the buyer-facing payment-method list look like per delivery
   option? **Partially decided (2026-11-22, see "Decisions"):** the
   checkout payment list is Barion + bank transfer; card + wallet are
   the first-ship funding sources. **Resolved (via Q14):** Google/Apple
   Pay need nothing from us either way — the per-payment
   `FundingSources` flags are sent regardless, and Barion gates the
   display by merchant contract.
10. **DECIDED (2026-11-22): bare deposit line, with a mandatory manual
    validation step.** Prepaid Barion payments show the order's item
    lines (the natural, honest rendering); the COD deposit payment
    shows a **single bare deposit line** — e.g. "Előleg — Babasarok
    rendelés #<order code>", 6 000 Ft — no itemized order context (it
    risks the buyer reading the items as today's charge on a page whose
    cardinal rule is what-you-see-is-what-you-pay). **Manual test step
    for the owner** (sandbox test payment, before go-live): confirm the
    deposit line reads correctly on the real gateway; if it doesn't
    make sense in practice, revisiting the item authoring is a small,
    localized change — the question is not kept open for it. (Factual
    half settled in [barion-api.md](../barion-api.md) §14.3: the gateway
    shows exactly the `Total` and `Items` we send; `Comment` is not
    shown; there is no "full order with a partial transaction" mode.)
11. **DECIDED (2026-11-22): `PaymentType: Immediate` for both branches.**
    The reservation story is ruled out by the decided use-cases, not by
    the API: the deferred arrangement is deposit-based (the buyer pays
    6 000 Ft at placement and the remainder physically on delivery), so
    there is no full-total reservation to finish later — a Reservation
    would charge the buyer the full total up front, which is exactly
    what the utánvét branch must not do. The grounded caveats (fee
    pre-funding, card-death at finish) die with the option.
12. **DECIDED (2026-11-22) — refund policy.** Fulfillment not started →
    full refund. Fulfillment started → **COD: the deposit is not
    refunded** (the előlegszámla stays valid — no stornó); **prepaid: a
    partial refund is a supported option** (owner's discretion,
    case-by-case amounts). **Refunds are always owner-authorized on the
    dashboard; no auto-refund on cancellation** — customer-initiated
    cancellations arrive through the owner, who authorizes full or
    partial. Document mapping (grounded): full refund → számla
    **stornó**; partial refund → **helyesbítő számla**; refund the money
    first, correct the document second (storno documents can't receive
    AutoKassza pairings). Capability is native on every leg: Barion
    refunds full or partial per transaction on `Succeeded` payments
    (the wallet must hold the balance; card refunds can take up to
    30 days — buyer-communication fact), Vendure `refundOrder` creates
    partial `Refund` rows settled via `settleRefund`, and the Agent
    issues both document kinds. T&C: no new work — the owner already
    operates Barion, Számlázz.hu and GLS manually, so her existing
    legal texts are expected to cover it; the going-live T&C check
    (question 14's pre-work) verifies. Chargebacks (issuer-initiated)
    are not grounded in the docs gathered — treat as a Barion-side
    dispute process, revisit only if one occurs.
13. **DECIDED (2026-11-22).** *Endpoint:* one callback route on the
    backend — **the API subdomain directly** (e.g.
    `https://api.babasarok.net/payments/barion/callback`, registered via
    the plugin like the GLS controller); no site-side endpoint or proxy
    — Barion's `RedirectUrl` and `CallbackUrl` are independent
    per-payment parameters and may live on different domains. The
    **redirect goes to the site directly** (proper confirmation page);
    grounded rule: no financial decision on the returning customer —
    the page shows a pending state and the callback + PaymentState
    re-query drives the final state. *Multi-domain (owner:
    babasarok.net and babacot.eu simultaneously, same site/infra):* no
    structural problem; the one rule is that `RedirectUrl` **echoes the
    origin the buyer started from** (store the origin host on the order
    at placement or derive from the channel) — cookies are per-domain,
    so a cross-domain return would land her session-less. HMAC is
    domain-agnostic. *15 s ACK budget:* validate minimally, enqueue the
    re-query task, respond `200` immediately (the ADR 0020 worker
    architecture fits); the callback body is a pointer (`paymentId`),
    never a status. *IP list:* logged/soft-checked, **not hard-blocked**
    — Barion states the callback IP "may change any time"; the real
    authentication is that only a real paymentId resolves (Mollie
    baseline). *TLS:* callbacks require TLS 1.2+ and do not support
    TLS 1.3 yet — verification lives in the PR template's pre-merge
    checklist (added at the top, owner request). *HMAC-SHA512:*
    **capable but inactive at first ship** — pointer-only trust makes a
    forged callback cost one idempotent, rate-limited re-query, while
    activation is a one-way street (signing becomes mandatory in both
    directions, 5-minute clock tolerance). Build the client
    signing-capable (verify `node-barion` support at build time);
    activate-or-not is an explicit go-live decision with the owner.
14. **DECIDED (2026-11-22) — the action list lives on PR #133's
    pre-merge checklist.** *Timing:* undecided — the owner has login
    credentials but is currently locked out by 2FA; **regaining access
    is the first step**, and the live-shop application should happen
    early (human-gated approval; unverified accounts carry limits until
    full KYC, which triggers at volume thresholds or staff decision).
    *T&C:* the existing legal texts are expected to cover Barion
    payment (the owner already operates Barion manually) — verified as
    a checklist item. *Logo + price package:* handled during
    registration, checklist item. *Google Pay / Apple Pay:* **nothing
    to do site-side either way** — funding sources are per-payment
    flags and Barion gates them by contract ("won't be displayed no
    matter what you send"); the owner doesn't need to ask for anything.
    *Token/recurring approval:* **not needed** — nothing in the decided
    design recurs. *EUR wallet account check:* deferred — it surfaces
    with the Slovakia work regardless. *Go-live cutover:* checklist
    items (live POSKey per environment, redirect/callback URLs,
    **Cloudflare environment configuration for the API subdomain**,
    Payee = the shop's own wallet, sandbox artifacts don't carry over).
    Plus the owner's sandbox validation of the gateway deposit display
    (question 10).

### Checkout and site

15. **DECIDED (2026-11-22).** *One state-driven confirmation page:* the
    redirect lands on it (straight after payment — reinforced) and it
    renders by order state, never by the redirect: **Processing**
    (default on arrival; the callback + re-query resolves it, the page
    polls), **Success** (order confirmed, what happens next per the
    invoice flows), **Failed/Expired** (declined, window lapsed,
    gateway-cancelled). *No inline retry on failure:* the Failed/Expired
    state takes the buyer **back to the checkout page with the basket
    intact**, on the payment/confirmation step (exact wizard step is an
    implementation detail) — retry happens through the normal checkout
    flow, which also offers the bank-transfer escape hatch. Note for the
    implementation: this requires the wizard to resume from the placed
    order's lines (orders are placed at checkout submission, so the
    "basket" after a failed payment is the placed order in the payment
    state). *Buyer never returns from the gateway:* acceptable — the
    confirmation email exists, the callback records a successful payment
    even without the redirect, and the sweep catches abandonment;
    abandoned-in-payment orders rest flagged. *PaymentWindow:* Barion's
    default (30 minutes) is kept.
16. **DECIDED (2026-11-22): follow-up, not bundled with epic 7 —
    tracked in [issue #135](https://github.com/babasarok/babasarok-website/issues/135).**
    Tracking changes need extra care, and the rework is bigger than the
    timing fix: the current Purchase payload doesn't represent Vendure
    order items and baskets aren't tracked at all. **In epic 7's scope:
    store the Meta handle** (`_fbp`, optionally `_fbc`) on the order
    under `marketing` consent — a placement-time field, so the
    follow-up needs no checkout change and the handle exists before the
    server-side consumer goes live. Until the rework, the client-side
    Purchase keeps firing at placement (pre-Barion behavior). The
    server-side Conversions-API event, `event_id` dedupe, item-level
    payload, basket tracking and the privacy-notice update all live in
    the issue.

### Multi-market (epic 9 boundary)

17. **DECIDED (2026-11-22, corrected framing).** Two non-negotiables
    (owner): **hardcoding HUF is not tolerated** — currency always
    comes from the order/price data, never from code — and **2-decimal
    EUR precision must be supported**, which means the money strategy
    becomes currency-aware (HUF 0 digits, EUR 2) before any
    multi-market work; this overrules epic 9's earlier "round whole-euro
    prices" lean. **Seam correction (owner):** language is driven by the
    user's browser locale; **currency/channel by the user's location**
    (IP lookup — the site is behind Cloudflare, so geo data is already
    in the request). Two separate axes — the epic 8 "prices stay HUF
    for English" decision is a language-scope decision, not a
    currency-language coupling; a location→channel/currency selection
    mechanism is epic 9 work. The Barion handler is currency-agnostic
    by construction. **EUR wallet account: not opened now** (owner,
    2026-11-22) — the owner will first check whether a EUR account
    already exists in the Barion wallet before any epic 9 decision;
    opening one stays an operational epic 9 checkbox. **Money-strategy
    work: deferred by default, opportunistic** — if the Barion
    implementation touches money-strategy code anyway, the
    currency-aware precision (HUF 0, EUR 2) is implemented as part of
    this ADR's work; otherwise it is epic 9's first slice. Shape:
    per-currency semantics — HUF keeps its 0-decimal interpretation and
    display (visually HUF never shows decimals), EUR gets 2. Warning:
    changing HUF's storage precision would rescale every stored amount
    (precision defines the interpretation of stored integers) — never
    done naively; the per-currency approach preserves existing data;
    verify the installed strategy's semantics before touching.
    **Epic 9 drivers (confirmed by the owner, 2026-11-22):** a second
    channel shares the default channel's products (inheritance); and
    there is no HUF→EUR conversion for pricing — EUR prices are issued
    manually per product, with values chosen independently of the HUF
    price.
18. The 6 000 Ft deposit is a Hungary rule — is the deposit amount a
    delivery-option property, a channel property, or per-market data?
    **Direction decided (2026-11-22, see "Decisions"):** the deposit is
    arrangement-scoped data with a single source, and the owner expects
    it to differ per channel — so model it channel-ready from the start.
    The final home (channel vs. per-market table) lands at epic 9.

### Build vs. adopt (new, 2026-11-15)

19. **DECIDED (2026-11-22): the custom Vendure Barion handler is built;
    Számlázz.hu's Online fizetés is rejected as the architecture.** See
    "Decisions" — Build vs. adopt. The Számlázz.hu online-payment
    feature (Barion/SimplePay behind díjbekérők, with the free
    auto-invoice → IPN chain) may return later as a fallback re-payment
    channel, not as the payment architecture.
