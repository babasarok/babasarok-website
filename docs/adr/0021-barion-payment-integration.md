# ADR 0021 — Barion payment integration

Status: **proposed** (2026-11-22). The refinement phase is complete:
every question the draft phase raised has an answer, decided with the
owner. This document is the implementation plan for epic 7's payment
work; the verified ground truth it stands on is kept in full so every
decision remains traceable to its evidence.

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

(The flow as recorded 2026-11-13; during refinement a deferred
personal-pickup variant was considered and dropped — see "The delivery
× payment model".)

Today everything after the order email is manual: the owner issues
díjbekérők in Számlázz.hu, **AutoKassza pairs the bank transfer with the
díjbekérő and notifies her**, she issues the invoice(s) and saves the GLS
label ([ADR 0020 — GLS labels](0020-gls-labels-via-mygls-api.md)).

## Verified ground truth

This section is the evidence base; the design below stands on it.

### Barion (verified 2026-11-13, re-grounded 2026-11-15)

Sources: docs.barion.com (Payment-Start-v2, Responsive web payment,
Sandbox, Making a test payment, FundingSources, Callback mechanism,
Barion Shop Authentication, Supported currencies, List of API endpoints,
Going live, Security Measures) — full per-claim citations in
[barion-api.md](../barion-api.md).

#### The API

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
  supported on requests (relevant for `Payment/Start` retries; the page
  is live-wiki only, exact mechanics re-check at build time).
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

#### Payment methods

Per-payment `FundingSources` flags:

| Value          | Method                | Notes                                                                                  |
| -------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `Balance`      | Barion wallet balance | cannot be disabled                                                                     |
| `BankCard`     | Bank card             | guest or Barion user                                                                   |
| `GooglePay`    | Google Pay            | guest only, capable devices; **gated by the merchant's contract**, not the API call    |
| `ApplePay`     | Apple Pay             | guest only, capable devices; same contract gate                                        |
| `BankTransfer` | Online bank transfer  | ⚠️ "no longer supported" as of 2026-01-09, replacement still being sought (2026-11-15) |

No PayPal, no iDEAL as funding sources (per the table above);
QR Platba is CZK-only, and "the per-currency minimums apply in tests
too" — both beyond the gathered docs (UNVERIFIED; see residual
uncertainties). The deprecated bank-transfer
source confirms the roadmap's design: the bank-transfer branch stays
manual (díjbekérő → AutoKassza), outside Barion.

#### Currencies

HUF, EUR, CZK, USD, RON, PLN — one per payment, and the merchant's wallet
must hold an account in that currency. Minimums apply (HUF 10 Ft; EUR
0.1 €, USD $0.1, CZK 1 Kč — RON/PLN minimums and decimal precision are
undocumented; verify before epic 9). HUF has no decimal digits (matches
`ForintMoneyStrategy`).

#### Test environment

- `api.test.barion.com` + `secure.test.barion.com`; a completely separate
  environment from production (separate wallet, nominal funds only).
- Self-serve (unlike GLS): register, create a shop, the POSKey is
  generated automatically and sandbox shops are approved automatically
  (live shops need human approval).
- Card payments are a simulator: any future expiry, any CVC. Each
  `ProcessResult` has a
  dedicated test card (success, decline, fraud, SCA-soft-decline) — see
  [barion-api.md](../barion-api.md) §8.
- Recurring/token payments are enabled by default in the sandbox.

#### SDK and plugin landscape

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

#### Onboarding

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

### Ourselves (verified Vendure and Számlázz.hu constraints)

- **The order state machine blocks partial settlement** (verified in
  [ADR 0020 — GLS labels](0020-gls-labels-via-mygls-api.md), Vendure
  3.8.1): `checkPaymentsCoverTotal` requires the sum of authorized and
  settled payments to cover the full total, with at least one authorized
  payment, before `PaymentAuthorized`, and **settled
  payments only** to cover it before `PaymentSettled`
  ([vendure-payments.md](../vendure-payments.md) §2's nuance);
  `Delivered.to = [Cancelled]`;
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
  discipline explicitly. Which earlier states accept partial payment is
  resolved by the order-state design below.
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
  the rule still applies to _every_ paid díjbekérő on that prefix. Under
  the decided architecture it stays unused (see invoice automation).
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
  (a handler-vs-metadata choice) is ours to design (resolved by the
  payment-roles design below).
- **A complete state path exists for the deposit branch, but it leans on
  guard quirks** (all verified in the 3.8.1 source, re-verified
  2026-11-15): `ArrangingPayment → PaymentAuthorized` needs
  `checkPaymentsCoverTotal` relaxed (the 6 000 Ft deposit alone cannot
  cover); `PaymentAuthorized → Shipped` has no direct edge — the working
  hop is through `Modifying`, whose exit guard is vacuous with zero
  modifications, because `ArrangingAdditionalPayment`'s exit demands
  full coverage; the COD remainder then records inside
  `ArrangingAdditionalPayment` (see above) and the order settles. The
  grounding adds the fact that settles the order-state baseline: under
  the default guards a partially-paid order's only resting state is
  `ArrangingPayment`, and **from there it cannot ship**
  (`ArrangingPayment.to` has no fulfillment states) — parking is not a
  viable option; the choice is guard relaxation or a custom state. The
  design decides between them below.
- **The Meta purchase-tracking note (roadmap design note)** applies: once
  Barion redirects buyers to the gateway, the honest Purchase signal is a
  server-side event on payment confirmation, and the attribution handle
  must ride the order.
- **The Számla Agent supports everything the invoice flow needs**
  ([szamlazz-api.md](../szamlazz-api.md) §2–4): díjbekérő, előlegszámla,
  végszámla (exactly one per előlegszámla; set-off pairing via
  `rendelesSzam` or `<elolegSzamlaszam>`), stornó, line-itemized
  documents, an explicit `<fizetesiHataridoDatum>`, and registered
  prefixes via `<szamlaszamElotag>`. Payment method (`<fizmod>`, free
  text) is fixed at creation — no edit-after-issue; a mismatch means
  storno + reissue. Design constraints this adds: the backend must stamp
  `rendelesSzam`/`szamlaKulsoAzon` for correlation, and the
  átutalás↔utánvét choice happens before issuing, not after.
- **NAV reporting and the 27% ÁFA** ([szamlazz-api.md](../szamlazz-api.md)
  §7): NAV reporting is automatic once the account's NAV technical user
  is connected; 27% is the per-line `<afakulcs>` value the backend
  sends (the Agent does no math); a Barion payment changes only the
  `fizmod` string we choose.
- **The Számlázz.hu IPN exists** ([szamlazz-api.md](../szamlazz-api.md)
  §6): Számlázz.hu POSTs on every paid-amount change of a számla _or
  díjbekérő_ (including AutoKassza pairings and partial payments),
  carrying the document number, the parent díjbekérő's number, the order
  number, the _cumulative_ paid amount and the payment method. Trust
  model: unsigned (secret-in-URL + IP allowlist; verify by re-querying
  via `action-szamla_agent_xml`); any non-200 response drops the IPN
  permanently (only missing responses retry — 11 attempts, 5-day
  horizon); duplicates collapse to the newest state per document.
  AutoKassza itself has no standalone API (negative result, search trail
  in §6.3); the heavier Pénzügyi adatkapcsolat (#profi) pushes raw bank
  transactions but carries no pairing reference.

## Committed consequences (not decisions — they follow from the ground truth)

- **Epic 7 cannot be worked in isolated slices.** Barion, the
  Számlázz.hu invoice flow and the payment-confirmation notification are
  one design: the deposit branch makes the Barion payment amount, the
  invoice branch and the COD settle trigger the same problem. Slices are
  possible for rollout, not for design.
- **The bank-transfer branch stays outside Barion.** The funding source
  is deprecated; the branch is díjbekérő → AutoKassza → the payment
  recorded on the order (natively via the IPN receiver, manually as
  fallback) — the manual recording is what
  [docs/roadmap.md](../roadmap.md) already sketches; the IPN receiver
  automates it.
- **Development happens against the sandbox.** Unlike GLS, it is
  self-serve, so the sandbox integration can start immediately.
- **A custom payment method handler + callback controller is the only
  Vendure plugin path.** Nothing to buy or adopt; a small typed client
  (the [ADR 0020 — GLS labels](0020-gls-labels-via-mygls-api.md)'s
  GLS-client pattern) or `node-barion` — an implementation choice, not a
  design question.

## The design

Decided with the owner on 2026-11-22; constrained by the ground truth
above.

### 1. The delivery × payment model — the arrangement axis

Delivery and payment split into orthogonal dimensions. The matrix below
is the current _product_ of the dimensions — the implementation must
compose them, never enumerate pairs.

Delivery variants (Vendure `ShippingMethod`s; the GLS parcel shop is a
future row):

| Delivery variant               | Payment arrangement                             |
| ------------------------------ | ----------------------------------------------- |
| GLS házhozszállítás            | full prepay (Barion or bank transfer)           |
| GLS házhozszállítás utánvéttel | **6 000 Ft deposit** now, rest collected by GLS |
| Személyes átvétel Telkibányán  | full prepay (Barion or bank transfer)           |

- **COD stays its own GLS shipping method** (`gls-utanvet`): the GLS
  worker already reads the method code and sends
  `cashOnDelivery: { amount: outstanding, reference: order.code }` on
  the label — keeping the variant preserves that with no GLS-side rework.
- **Personal pickup is full-prepay only.** A deferred pickup variant was
  considered and dropped (owner, 2026-11-22); the arrangement axis makes
  re-adding it a new variant row, not a redesign.
- _Full-now_ vs. _deposit-now + rest-at-handover_ is a **capability of
  the delivery variant** (a shipping-method custom field), not a payment
  method and not an enumerated pair. New delivery options declare the
  flag and immediately work with every payment method.
- **The 6 000 Ft deposit is arrangement-scoped data with a single
  source** — not hardcoded per consumer (GLS worker, checkout copy,
  invoice builder all read it from one place). The deposit rides the
  deferred delivery variant, not GLS as such — any future deferred
  variant carries the same arrangement. It will most likely
  differ per channel when the shop expands (owner, 2026-11-22), so the
  modeling must be channel-ready from the start (epic 9; see the
  multi-market section).
- A payment method that cannot serve an arrangement (if one ever
  appears) is excluded by a declarative eligibility rule against the
  arrangement, never by forking methods or deleting matrix cells.
- **The deposit order-state path must not branch on payment method**
  (owner, 2026-11-22): once a payment is recorded on the order, every
  form of payment is equivalent — the custom state machine, the GLS
  worker's deliver-when-settled rule and the invoice triggers behave
  identically whether the deposit arrived via Barion or AutoKassza/IPN.

### 2. Payment options on the site

- **The checkout payment step offers exactly two methods**: **Barion**
  (card guest + Barion wallet balance at first ship) and **bank
  transfer** (buyer-selectable — see invoice automation). Bank transfer
  becomes a real checkout option: the existing
  `backend/src/bank-transfer-handler.ts` flips from owner-only
  recording to buyer-selectable — the buyer picks átutalás and the
  order parks in `ArrangingPayment` (which is where manual payments are
  addable, per the ground truth), waiting for the IPN/owner to record
  the transfer. The payable
  amount derives from the selected delivery variant's arrangement: full
  total, or the deposit. The deposit disclosure appears when a deferred
  variant is selected; the amount comes from the arrangement data.
- **Funding sources inside the Barion gateway**: the per-payment
  `FundingSources` flags are sent regardless (card, wallet, Google Pay,
  Apple Pay); Barion gates the display by merchant contract — "won't be
  displayed no matter what you send". **Nothing to build either way**;
  the owner doesn't need to ask for anything at onboarding.
- **Gateway display of the deposit payment** (the gateway shows exactly
  the `Total` and `Items` we send; `Comment` is not shown; there is no
  "full order with a partial transaction" mode — [barion-api.md](../barion-api.md)
  §14.3): prepaid Barion payments show the order's item lines (the
  natural, honest rendering); the COD deposit payment shows a **single
  bare deposit line** — e.g. "Előleg — Babasarok rendelés #<order
  code>", 6 000 Ft — no itemized order context (it risks the buyer
  reading the items as today's charge on a page whose cardinal rule is
  what-you-see-is-what-you-pay). **Manual test step for the owner**
  (sandbox test payment, before go-live): confirm the deposit line reads
  correctly on the real gateway; if it doesn't make sense in practice,
  revisiting the item authoring is a small, localized change — the
  question is not kept open for it.
- **`PaymentType: Immediate` for both branches.** The reservation story
  is ruled out by the decided use-cases, not by the API: the deferred
  arrangement is deposit-based (the buyer pays 6 000 Ft at placement and
  the remainder physically on delivery), so there is no full-total
  reservation to finish later — a Reservation would charge the buyer the
  full total up front, which is exactly what the utánvét branch must not
  do. The grounded caveats (fee pre-funding, card-death at finish) die
  with the option.
- **`PaymentWindow`: Barion's default (30 minutes) is kept.**

### 3. The custom Barion handler

**The custom Vendure Barion handler is built; Számlázz.hu's Online
fizetés is rejected as the architecture.** The owner's criterion is
control: control on the site and on Vendure, every external API
integrated as a plugin/service (the GLS-plugin pattern), and a real
Barion payment handler on the checkout page. Számlázz.hu's Online
fizetés — Barion/SimplePay behind díjbekérők, whose díjbekérő →
auto-invoice → IPN chain would come for free
— is rejected because the buyer would pay through Számlázz.hu's own
page: no in-checkout redirect, no `Payment/Start`-level payer data for
3DS pass rates, no deposit collection at placement, no payment metadata
on the order. It may return later as a _fallback re-payment channel_
(e.g. gateway abandonment), not as the architecture.

Shape: one plugin at `backend/src/plugins/barion/` (the GLS pattern) —
handler + callback controller; a small typed client (the GLS-client
pattern) or `node-barion` — an implementation choice, not a design
question. 3DS-related payer data (name, e-mail, phone, shipping address)
is fed to `Payment/Start` from the checkout's collected fields — a
mapping task, raising SCA pass rates. The handler is **currency-agnostic
by construction** (currency always from the order — see multi-market).

**Rejected architecture detail:** with Számlázz.hu's Online fizetés the
per-prefix auto-invoicing setting _would_ fire — under the decided
architecture it cannot (our payments settle in the Barion wallet, not in
Számlázz.hu), so the per-prefix setting stays relevant only if the thin
fallback channel is ever adopted.

### 4. Order state design

- **Route: the Vendure docs' recommended custom-payment-flows route.**
  The deposit branch goes through a **custom `OrderProcess` state** (the
  documented custom states + `mergeStrategy` mechanism, custom
  `OrderPlacedStrategy` as needed). Guard relaxation
  (`checkPaymentsCoverTotal` / `checkAdditionalPaymentsAmount` toggles)
  is the fallback only if implementation hits considerable snags. Why a
  custom state is needed at all: under the default guards a
  partially-paid order's only resting state is `ArrangingPayment`, and
  from there it cannot ship — parking is not viable (see ground truth).
- **The state-by-state consequence matrix is an implementation
  deliverable:** enumerate the states from placement to `Delivered`,
  decide which accept partially paid orders, and lock down, per state:
  cancellation (and the deposit's refund path), modification, onward
  transition, dashboard display and GLS-worker behavior. States that
  stay full-payment-only must refuse the deposit branch explicitly, not
  silently.
- **Payment roles — three payment-method codes with a shared
  `metadata.role` marker.** `barion` (any gateway payment — full total
  or deposit; `transactionId` = Barion `paymentId`), `bank-transfer`
  (buyer transfer recorded via IPN/owner — prepaid full or COD deposit;
  `transactionId` = the pairing reference, `metadata` carries the
  díjbekérő number), `cod-remainder` (the settle-on-delivery recording,
  manual action, amount = the deficit; `transactionId` = the GLS
  remittance/pairing reference). Every payment's `metadata` carries
  `role: "full" | "deposit" | "remainder"` — the invoice builder, the
  refund flows and the dashboard branch on **`role`**, not on the method
  code (method is payment-option-owned, role rides the arrangement axis
  — the seams compose). No new payment custom fields until a dashboard
  query need proves otherwise; the stock dashboard's metadata rendering
  is UNVERIFIED (UI surface) — a small dashboard extension is the
  fallback. Refund asymmetry note: with `Immediate` everywhere, Barion
  payments settle at confirmation, so `refundOrder` (needs `Settled`
  payments) is the normal path for full payments and deposits alike; the
  `cancelPayment` path stays reserved for future two-phase methods.
  Under the guard-relaxation _fallback_ the deposit-only order rests in
  `PaymentAuthorized`, where `refundOrder` is refused
  (`RefundOrderStateError`) even for a settled deposit — there the
  handler's cancel path does the money: `CancelAuthorization` for an
  authorized hold, a Barion `Refund` for a settled payment.
- **Settle-on-delivery leg:** the verified path stands, entered from
  the state the order actually occupies at delivery — it sits `Shipped`
  (shipped partially paid, whatever route brought it there), and the
  grounded
  full path is `Shipped → Modifying → ArrangingAdditionalPayment →
addManualPaymentToOrder (amount = the deficit) → PaymentSettled`
  ([vendure-payments.md](../vendure-payments.md) implications §3), with
  the standing caveat that the manual-payment action records only the
  exact deficit, so the 6 000 Ft deposit itself enters through the
  handler path.
- **Fulfillment-started boundary: a custom-field flag
  `fulfillmentStartedAt`** on the order, set by a dashboard action when
  the owner starts making the product (her definition spans production
  and shipping; made-to-order throughout — "ready-made" means materials
  at hand). The refund-policy check reads this flag. Vendure fulfillments
  are created at shipping time, so they mark the wrong boundary; naming
  note: Vendure core "fulfillment" means shipping only — the flag is
  ours and means the owner's broader sense.
- **Failed delivery: a custom `Returned` state**, entered automatically
  by the GLS worker when the parcel is **actually returned to sender**
  (GLS problem codes 23/40). This amends ADR 0020 decision 5 ("the
  worker moves only the fulfillment"): the state entry is the flag —
  the automatic act stops at flagging, no auto-cancel. The other
  problem statuses (16 no cash, 17 refused, 20 address) never leave
  the delivery path and are not `Returned` material — they stay
  owner-flagged as today (ADR 0020's email + order note); how they map
  to order states is the consequence matrix's job. Owner-chosen exits
  from `Returned`: → `Cancelled` (deposit kept per the refund policy,
  előlegszámla untouched) or → back into the fulfillment path
  (re-fulfill after talking to the customer — honest mistake).
  `Cancelled` stays terminal — no custom edge out of it.
- **Delivered but remainder never confirmed: a flagged resting state**
  (the deliver-when-settled rule keeps it out of `Delivered`); the
  remittance-lag threshold before flagging needs grounding (owner
  knowledge → GLS docs → GLS support as last resort); chasing a buyer
  who claims she paid the courier is a manual, human settlement —
  nothing on Vendure.

### 5. Payment confirmation and reconciliation

Two confirmation sources, one recording path into the order state:

- **Barion's callback** (gateway payments): one callback route on the
  backend — **the API subdomain directly** (e.g.
  `https://api.babasarok.net/payments/barion/callback`, registered
  through the plugin as an HTTP controller — the Mollie plugin's
  webhook pattern is the reference; the GLS plugin has only admin
  GraphQL extensions, no controller); no site-side endpoint or proxy —
  Barion's `RedirectUrl` and `CallbackUrl` are independent per-payment
  parameters and may live on different domains. The **redirect goes to
  the site directly** (proper confirmation page, landed on straight
  after payment); grounded rule: no financial decision on the returning
  customer. **One state-driven confirmation page:** it renders by the
  order's state, never by the redirect — **Processing** (the default on
  arrival; the callback + `PaymentState` re-query resolves it, and the
  page polls the order state via the shop API — never PaymentState from
  the browser, the POSKey must not reach the client), **Success**
  (order confirmed, what-happens-next per the
  invoice flows), **Failed/Expired** (declined, window lapsed,
  gateway-cancelled). Failed/Expired takes the buyer **back to the
  checkout with the basket intact**, on the payment/confirmation step
  (the exact wizard step is an implementation detail) — retry happens
  through the normal checkout flow, which also offers the bank-transfer
  escape hatch. This requires the wizard to resume from the placed
  order's lines: orders are placed at checkout submission, so the
  "basket" after a failed payment is the placed order in the payment
  state. The resume mechanism itself (reactivating the placed order vs.
  cloning its lines into a fresh active order) is not grounded in the
  gathered Vendure docs — see residual uncertainties.
  _Buyer never returns from the gateway:_ acceptable — the
  confirmation email exists, the callback records a successful payment
  even without the redirect, and the sweep catches abandonment;
  abandoned-in-payment orders rest flagged. _Multi-domain (owner: babasarok.net and babacot.eu
  simultaneously, same site/infra):_ no structural problem; the one rule
  is that `RedirectUrl` **echoes the origin the buyer started from**
  (store the origin host on the order at placement or derive from the
  channel) — cookies are per-domain, so a cross-domain return would land
  her session-less. HMAC is domain-agnostic. _15 s ACK budget:_ validate
  minimally, enqueue the re-query task, respond `200` immediately (an
  enqueue-and-job mechanism — the GLS worker is a 30-minute scheduled
  task, which does not fit an on-demand callback); the callback body is
  a pointer (`paymentId`),
  never a status. _IP list:_ logged/soft-checked, **not hard-blocked** —
  Barion states the callback IP "may change any time"; the real
  authentication is that only a real paymentId resolves (Mollie
  baseline). _TLS:_ callbacks require TLS 1.2+ and do not support
  TLS 1.3 yet — verification lives in PR #133's pre-merge checklist.
  _HMAC-SHA512:_ **capable but inactive at first ship** — pointer-only
  trust makes a forged callback cost one idempotent, rate-limited
  re-query, while activation is a one-way street (signing becomes
  mandatory in both directions, 5-minute clock tolerance). Build the
  client signing-capable (verify `node-barion` support at build time);
  activate-or-not is an explicit go-live decision with the owner.
- **The Számlázz.hu IPN** (all bank-side money: prepaid transfers, COD
  deposits via transfer, and the COD remainder — GLS remits after
  delivery, AutoKassza pairs the bank line via the order code, the IPN
  reports it): **adopted as a payment-confirmation source.** The
  receiver records bank-transfer payments on the order automatically
  (prepaid and COD deposit alike — the deposit order-state path is
  payment-method-agnostic). **The COD remainder is confirmed, not
  auto-recorded:** the IPN (GLS remits after delivery → AutoKassza pairs
  the bank line via the order code → the document's paid amount changes)
  is its confirmation source and flags the order, but the recording is
  the owner's manual action — a `cod-remainder` payment with amount =
  the deficit, through the settle-on-delivery leg (§4). Auto-recording
  it would settle and deliver the order as a side effect of a bank
  line — the owner must see the money state first (the same principle
  as the refund policy: automation flags, the owner decides).
  Grounded design constraints: idempotent on
  **cumulative** amounts (overwrite, never add — duplicates collapse to
  the newest state per document), verify by re-querying the document via
  `action-szamla_agent_xml`, and never return a non-200 on processing
  failure (any non-200 drops the IPN permanently; only connection
  failures retry — 11 attempts, 5-day horizon). Trust: unsigned POST —
  secret token in the URL, Számlázz.hu sender-IP allowlist, and the
  re-query as the real check.

**Push is never the sole source of truth — but it is the fast path**
(owner, 2026-11-22). The IPN is processed immediately on ack; the
reconciliation sweep exists for our own uncertainty, not as standing
distrust of Számlázz.hu. Sweep triggers: (a) startup after our downtime
(watermark check), (b) our own processing failures, (c) deadline
passing, (d) a low-frequency safety net over payment-relevant states
only. For every such order, re-query its documents via
`action-szamla_agent_xml` (by `rendelesSzam` / `szamlaKulsoAzon`) and
reconcile the `<kifizetesek>` block against recorded payments —
idempotently, through the same apply-state function the IPN receiver
uses. This catches IPNs lost to our downtime (including past the 5-day
retry horizon), partial payments, and deadline-passed unpaid orders
(flagged for the owner). Volume is structurally bounded: Számlázz.hu has
**no list endpoint**, so only documents we can name are queryable — the
sweep walks our order list (our DB is the index), a handful of orders at
a time, paced per their behavioral guidance (max 5 attempts per request,
no loops, ban risk). Known blind spots, accepted by the owner
(2026-11-22): documents we didn't issue (owner's manual ones —
unresolvable IPNs are logged; the owner handles manual documents and
order states by hand), and bank lines AutoKassza never paired (flagged
when a deadline passes unpaid; recoverable manually on both sides — the
dashboard's manual-payment action takes a transaction reference, and the
Agent's credit entry can mark the document paid). The same pattern is
mandated on the Barion side: `PaymentState` v4 is authoritative per
`paymentId`, and bounded fallback polling is prescribed by Barion's docs
(its 429 limit is per payment, 1 query / 5 s) — two sweeps, one
reconciliation function, our DB indexing both.

### 6. Invoice automation (Számlázz.hu)

- **Automated, backend-issued.** Documents fire on **(payment
  arrangement, confirmation event)** — two axes — never on
  delivery×payment pairs (the invoice branching was always two ways —
  prepaid → számla; deferred → előlegszámla + végszámla; the axis only
  changes how the branch is determined):

  | Event                                               | Document fired                       |
  | --------------------------------------------------- | ------------------------------------ |
  | Barion full payment confirms (any prepaid variant)  | számla (paid, `fizmod` = bankkártya) |
  | Bank transfer settles (AutoKassza → IPN)            | számla                               |
  | 6 000 Ft deposit confirms (Barion or transfer, COD) | előlegszámla                         |
  | Owner marks the product finished (COD branch)       | végszámla with deposit set-off       |

  The backend issues via the Számla Agent on our own payment events:
  for Barion branches the document is issued directly, already marked
  paid (`<fizetve>`, `fizmod` = bankkártya). The Agent supports both
  this shape and the credit-entry shape (`action-szamla_agent_kifiz` can
  mark díjbekérők and számlák paid); Barion branches use the
  already-marked-paid shape.

- **The demand-document seam: a díjbekérő exists iff the payment option
  is not self-demanding.** Barion branches (prepaid and COD deposit)
  issue no díjbekérő — the gateway is the demand; bank-transfer branches
  keep it (it is the demand: bank details, deadline, AutoKassza's
  pairing anchor). The díjbekérő's form is **owned by the payment
  option** (its plugin surface declares the demand instrument and the
  document's content), consumed by the Számlázz.hu invoicing service —
  no `if barion` in the invoice builder. A future deferred option
  declares its own demand form (e.g. the invoice itself for invoice
  terms); the seam needs no new axis. The per-prefix auto-invoicing
  setting stays unused under this architecture (see the rejected
  architecture in "The custom Barion handler").
- **Számlázz.hu delivers the díjbekérő email** (`sendEmail` on,
  customizable subject/body) — conditioned on document language
  (`<szamlaNyelve>` covers `hu`/`en`/`sk` and more, so new-country
  rollouts work), paid-notification (the IPN — adopted), and the
  díjbekérő being a first-class document type (it is). The
  order-confirmation email must point to it and carry the order code
  as the reference.
- **Reference convention (proposal):** **the order code everywhere** —
  the GLS label already sends `order.code` as `clientReference` and COD
  reference, so one reference across díjbekérő, GLS and bank statements
  makes AutoKassza pairing and IPN correlation trivial.
- **NAV/ÁFA:** reporting is automatic once the account's NAV technical
  user is connected; 27% is the per-line `<afakulcs>` value the backend
  sends; a Barion payment changes only the `fizmod` string. The 27%
  reaches the invoice from the order, not as a constant: epic 7's
  Vendure-side tax step (roadmap) sets the 27% HU `TaxRate`, and the
  invoice builder reads the rate off the order's lines — the invoice
  side assumes it, it does not set it.

### 7. Refunds and cancellations

- **Policy (owner, 2026-11-22):** fulfillment not started (`fulfillmentStartedAt`
  unset) → full refund. Fulfillment started → **COD: the deposit is not
  refunded** (the előlegszámla stays valid — no stornó); **prepaid: a
  partial refund is a supported option** (owner's discretion,
  case-by-case amounts).
- **Refunds are always owner-authorized on the dashboard; no auto-refund
  on cancellation** — customer-initiated cancellations arrive through
  the owner, who authorizes full or partial. (A future customer-facing
  order-management page may _request_ cancellation/refund; it surfaces
  in Vendure for the owner to authorize — on the roadmap as follow-up
  work, not part of epic 7.)
- **Document mapping (grounded):** full refund → számla **stornó**;
  partial refund → **helyesbítő számla**; refund the money first,
  correct the document second (storno documents can't receive AutoKassza
  pairings).
- **Capability is native on every leg:** Barion refunds full or partial
  per transaction on `Succeeded` payments (the wallet must hold the
  balance; card refunds can take up to 30 days — buyer-communication
  fact), Vendure `refundOrder` creates partial `Refund` rows settled via
  `settleRefund`, and the Agent issues both document kinds.
- **T&C:** no new work — the owner already operates Barion, Számlázz.hu
  and GLS manually, so her existing legal texts are expected to cover
  it; the going-live T&C check verifies.
- **Chargebacks** (issuer-initiated) are not grounded in the docs
  gathered — treat as a Barion-side dispute process, revisit only if one
  occurs.

### 8. Meta purchase tracking

**Follow-up, not bundled with epic 7 — tracked in
[issue #135](https://github.com/babasarok/babasarok-website/issues/135).**
Tracking changes need extra care, and the rework is bigger than the
timing fix: the current Purchase payload doesn't represent Vendure order
items and baskets aren't tracked at all. **In epic 7's scope: store the
Meta handle** (`_fbp`, optionally `_fbc`) on the order under `marketing`
consent — a placement-time field, so the follow-up needs no checkout
change and the handle exists before the server-side consumer goes live.
Until the rework, the client-side Purchase keeps firing at placement
(pre-Barion behavior). The server-side Conversions-API event, `event_id`
dedupe, item-level payload, basket tracking and the privacy-notice
update all live in the issue.

### 9. Multi-market boundary (epic 9)

- **Two non-negotiables (owner):** **hardcoding HUF is not tolerated** —
  currency always comes from the order/price data, never from code — and
  **2-decimal EUR precision must be supported**, which means the money
  strategy becomes currency-aware (HUF 0 digits, EUR 2) before any
  multi-market work; this overrules epic 9's earlier "round whole-euro
  prices" lean.
- **Seam correction (owner):** language is driven by the user's browser
  locale; **currency/channel by the user's location** (IP lookup — the
  site is behind Cloudflare, so geo data is already in the request). Two
  separate axes — the epic 8 "prices stay HUF for English" decision is a
  language-scope decision, not a currency-language coupling; a
  location→channel/currency selection mechanism is epic 9 work.
- **EUR wallet account: not opened now** (owner, 2026-11-22) — the
  question surfaces with the Slovakia work regardless; the owner will
  first check whether a EUR account already exists in the Barion wallet
  before any epic 9 decision; opening one stays an operational
  epic 9 checkbox.
- **Money-strategy work: deferred by default, opportunistic** — if the
  Barion implementation touches money-strategy code anyway, the
  currency-aware precision (HUF 0, EUR 2) is implemented as part of this
  ADR's work; otherwise it is epic 9's first slice. Shape: per-currency
  semantics — HUF keeps its 0-decimal interpretation and display
  (visually HUF never shows decimals), EUR gets 2. Warning: changing
  HUF's storage precision would rescale every stored amount (precision
  defines the interpretation of stored integers) — never done naively;
  the per-currency approach preserves existing data; verify the
  installed strategy's semantics before touching.
- **The deposit is arrangement-scoped data with a single source**
  (decided above), and the owner expects it to differ per channel —
  model it channel-ready from the start. Today the 6 000 Ft deposit is
  a Hungary rule; the final home (channel vs. per-market table) lands
  at epic 9.
- **Epic 9 drivers (confirmed by the owner, 2026-11-22):** a second
  channel shares the default channel's products (inheritance); and there
  is no HUF→EUR conversion for pricing — EUR prices are issued manually
  per product, with values chosen independently of the HUF price.
- **Pre-epic-9 data to verify with Barion:** RON/PLN minimums and
  decimal precision are undocumented.

## Implementation constraints (hard)

The implementation must respect these as design constraints, not runtime
discoveries — pacing, bounded retries and serialization are built in
from the start:

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

## Residual uncertainties (verify at build time; not open questions)

- Whether NAV's Online Számla spec constrains the fizetési-mód value for
  card payments (a NAV-spec question, not Számlázz.hu's).
- Whether Számlázz.hu's email wrapper text localizes per document
  language or follows the account language.
- How usefully the stock dashboard renders payment metadata (UI surface;
  a small dashboard extension is the fallback).
- Whether `node-barion` supports HMAC-SHA512 signing (the PHP library
  documents it; verify the Node client at build time).
- The installed `ForintMoneyStrategy`'s exact semantics, before any
  precision change is considered.
- The GLS remittance-lag threshold before "delivered but unpaid" is
  flagged (owner knowledge → GLS docs → GLS support as last resort).
- RON/PLN minimum amounts and decimal precision (Barion docs; verify
  before epic 9).
- Whether the Barion gateway keeps working while the account is in
  unverified (pre-KYC) status — plausible but not stated in the docs.
- Barion idempotency-key exact mechanics (the page is live-wiki only;
  which endpoints accept the key, header vs body — re-check when
  fetchable).
- Whether iDEAL/PayPal-type funding sources exist beyond the documented
  enum, and QR Platba's currency scope (verify against
  [barion-api.md](../barion-api.md)'s funding-sources and
  currency pages at build time).
- Whether sandbox card payments enforce the per-currency minimums the
  same way production does (verify at build time).
- The failed-payment return path's order-resume mechanism (reactivate
  the placed order vs. clone its lines into a fresh active order) —
  not grounded in the gathered Vendure docs; the "basket intact" UX
  promise depends on it. Verify in source at build time.

## Going live (owner actions — tracked on PR #133's pre-merge checklist)

- Regain Barion account access and register the live shop **early** —
  timing is undecided: the owner has login credentials but is currently
  locked out by 2FA (regaining access is the first step); approval is
  human-gated, and unverified accounts carry limits until full KYC
  (which triggers at volume thresholds or staff decision).
- Token/recurring approval: **not needed** — nothing in the decided
  design recurs.
- T&C covers Barion payment (Barion's staff check rejects shops whose
  legal texts don't properly cover it).
- Logo placement + price package chosen during registration (fees are
  package-based, deducted from the merchant balance after each payment).
- Sandbox validation of the gateway deposit display (the bare deposit
  line — see payment options).
- Go-live cutover: live POSKey per environment; redirect/callback URLs
  configured; **the Cloudflare environment for the API subdomain
  configured** (TLS floor, callback reachability); Payee = the shop's
  own wallet (a different Payee silently becomes a "sharing economy"
  payment); sandbox tokens/POSKeys do **not** carry over (per-environment,
  unchangeable later).
- Activate-or-not decision for HMAC signing (explicit go-live decision
  with the owner).

## Consequences

- **One design, sliced for rollout.** Barion, the invoice flow and the
  payment-confirmation notification cannot be designed separately (the
  deposit branch makes the payment amount, the invoice branch and the
  COD settle trigger the same problem); implementation slices exist, but
  they implement this one design.
- **The seams are the architecture.** Delivery × payment compose via the
  arrangement axis; document formation is payment-option-owned; the
  order-state path is payment-method-agnostic; documents fire on
  (arrangement, confirmation event). New delivery options, payment
  options and markets extend the axes — they do not grow a matrix.
- **Push channels are fast paths; sweeps are the correctness mechanism.**
  Barion callbacks and the Számlázz.hu IPN are pointers verified by
  re-query; neither provider's push is ever the sole source of truth.
- **Money is display-safe but storage-fragile.** HUF's 0-decimal
  interpretation is load-bearing for every stored amount; per-currency
  precision is the only safe path to EUR.
- **No auto-refunds, no auto-cancellations.** Money decisions on failed
  deliveries, refunds and cancellations are owner actions; automation
  flags, the owner decides.
