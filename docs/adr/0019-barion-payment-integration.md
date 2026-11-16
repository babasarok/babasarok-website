# ADR 0019 — Barion payment integration

Status: **draft** — a record of what we know and the questions we must
answer before starting. No decision is made here yet; this ADR becomes a
proposal only when the questions in the last section have answers.

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
label (ADR 0018).

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
  the docs *prescribe* bounded fallback polling (after redirect and after
  window expiry). The callback's state is never trusted — the server
  re-queries `PaymentState` and branches on that. Idempotency keys are
  supported on requests (relevant for `Payment/Start` retries).
- `Payment/Start` accepts 3DS-related payer data (name, e-mail, phone,
  shipping address); sending it raises SCA pass rates.
- **A Reservation charges the buyer immediately** — for card payments the
  money moves to the merchant's wallet and stays reserved *there* (not
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

| Value          | Method                | Notes                                                                               |
| -------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `Balance`      | Barion wallet balance | cannot be disabled                                                                  |
| `BankCard`     | Bank card             | guest or Barion user                                                                |
| `GooglePay`    | Google Pay            | guest only, capable devices; **gated by the merchant's contract**, not the API call |
| `ApplePay`     | Apple Pay             | guest only, capable devices; same contract gate                                     |
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

- **The order state machine blocks partial settlement** (verified in ADR
  0018, Vendure 3.8.1): `checkPaymentsCoverTotal` requires
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
  by the GLS worker's deliver-when-settled rule (ADR 0018) and the
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
  the rule still applies to *every* paid díjbekérő on that prefix. See
  question 5.
- **The COD remainder's money confirmation is bank-side:** AutoKassza
  pairs the bank statement line via the parcel's `CODReference` (ADR 0018) and notifies the owner. There is no hook from that notification
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
  (ADR 0018's GLS-client pattern) or `node-barion` — an implementation
  choice, not a design question. Whether a custom handler is needed *at
  all* is now question 19: Számlázz.hu's own Online fizetés runs on
  Barion and could serve the full-total branch thin.

## Questions to answer before starting

We do not start until every question here has an answer. The list is the
work plan for the refinement phase.

### Order state (the deposit problem)

The `Delivered` invariant is fixed (fully paid and physically delivered —
see the verified constraints); the design question is the states before
it.

1. **Enumerate the order process states from placement to `Delivered` and
   decide, state by state, which of them accept partially paid orders
   (the deposit branch lives in them) — with every consequence locked
   down before starting.** Partial payment has to survive placement and
   reach shipping (the GLS label is created and the parcel travels while
   only the deposit is paid), so "partially paid" cannot be confined to
   one waiting state. Each state that accepts it must answer: can it be
   cancelled (and what happens to the deposit — refund path), can it be
   modified, can it transition onward, what does the dashboard show, and
   what does the GLS worker (ADR 0018) do with it. The states that stay
   full-payment-only must refuse the deposit branch explicitly, not
   silently.
2. How do the two payments on one order stay distinguishable (Barion
   deposit vs. COD remainder) — Vendure `Payment` metadata, custom
   fields, separate handlers — for the invoice branch, the dashboard and
   refunds?
3. Does the settle-on-delivery leg record the COD payment through the
   verified path — `PaymentAuthorized → ArrangingAdditionalPayment →
addManualPaymentToOrder (amount = the deficit) → PaymentSettled` —
   rather than through `Modifying` as the roadmap sketch says (`Modifying`
   is the order-modification flow, and its exit guard vacuously passes
   with zero modifications; the recording action itself is not available
   there)? And what happens if the delivery fails or the buyer never pays
   (state and owner fallback for unpaid delivered orders — note the GLS
   worker's deliver-when-settled rule, ADR 0018, keeps such an order out
   of the irreversible `Delivered` state, which is what keeps recording
   possible at that point)?

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
5. When a Barion payment succeeds, which invoice fires — and what is the
   rule that tells the deposit branch from the full-total branch?
   (Premise revised 2026-11-15: the auto-előlegszámla document type is
   configured **per prefix**, so prefix-per-branch *is* a working rule —
   but the auto path fires only on AutoKassza/online settlements and
   applies to every paid díjbekérő on the prefix.) Open part: is the
   first version automated at all, or does the owner issue invoices by
   hand against recorded payments — and if automated, the per-prefix
   auto path or everything issued via the Agent ourselves?
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
   POSTs on every paid-amount change of a számla *or díjbekérő*
   (including AutoKassza pairings and partial payments), carrying the
   document number, the parent díjbekérő's number, the order number, the
   *cumulative* paid amount and the payment method. Trust model:
   unsigned (secret-in-URL + IP allowlist; verify by re-querying via
   `action-szamla_agent_xml`); any non-200 response drops the IPN
   permanently (only missing responses retry — 11 attempts, 5-day
   horizon); duplicates collapse to the newest state per document.
   AutoKassza itself has no standalone API (negative result, search
   trail in §6.3); the heavier Pénzügyi adatkapcsolat (#profi) pushes
   raw bank transactions but carries no pairing reference.
8. Do we adopt the IPN as a payment-confirmation source (it would serve
   the bank-transfer branch too — recording the payment on the order
   automatically), or does the manual dashboard action stay? If adopted,
   the receiver must be idempotent on cumulative amounts, verify by
   re-query, and never fail loudly (a non-200 drops the event) — a
   design question now, not a research one.

### Barion-side choices

9. Which funding sources do we enable at first ship (card only?
   +wallet? Google/Apple Pay depending on the merchant contract), and
   what does the buyer-facing payment-method list look like per delivery
   option?
10. What does the deposit payment show on the Barion gateway — and which
    do we want the buyer to see? **Factually settled**
    ([barion-api.md](../barion-api.md) §14.3): the gateway shows exactly
    the `Total` and `Items` we send — `Comment` is not shown, and there
    is no "full order with a partial transaction" mode; a 6 000 Ft
    payment displays as a 6 000 Ft payment whose item lines are entirely
    ours to author. Remaining: the product decision of what the buyer
    should see (a bare deposit line vs. itemized order context).
11. `PaymentType: Immediate` for both branches, or does a reservation
    shape serve a story we have not identified? The `Reservation` story
    (verified: window up to 365 days, per-transaction finish, partial
    finish auto-refunds the difference, finish callable across the
    window) would make the COD remainder electronic — the courier never
    touches money and the deposit-vs-remainder state problem collapses
    into one payment. Grounding sharpened the cost side
    ([barion-api.md](../barion-api.md) §5, §14.10–11): a Reservation
    **charges the buyer immediately** — the money is Barion-held in the
    merchant's wallet, not a card hold — so the buyer pays the full
    total at placement, full stop, and the gateway UI is identical (she
    cannot tell); if her card is dead by finish time the auto-refund
    fails and the owner owes a manual refund; and reservation fees must
    sit pre-funded in the merchant wallet at Start. `DelayedCapture`
    (7/21 days) is ruled out for made-to-order lead times. Still a
    product decision — and it also decides what the COD delivery option
    means for the buyer.
12. Refund/chargeback policy: who issues refunds and when, and how does
    a Barion refund map to számla corrections (Számlázz.hu
    stornó)?
13. Callback endpoint on the deployed backend: URL per environment
    (previews, prod), HMAC key adoption (yes/no — noting adoption is a
    three-step activation — set key → Barion activates → enable callback
    verification — after which signing is mandatory in both
    directions), and the 15 s ACK budget under the worker's load.
    Grounded constraints: callbacks require TLS 1.2+ (TLS 1.3
    unsupported yet) from documented per-environment IPs (`40.113.73.229`
    prod, `20.223.214.216` sandbox), and PaymentState re-queries are
    429-limited to one per payment per 5 s.
14. The merchant's live onboarding steps and their timing (manual shop
    approval is universal; full KYC is limit-gated) — when does the owner
    apply, and what contract extras (Google Pay, token payments) does she
    ask for? Going-live pre-work from the docs: T&C text mentioning
    Barion payment, official logo placement, price-package choice.

### Checkout and site

15. The checkout payment step's UX: what the buyer picks, what the
    "6 000 Ft deposit is collected now" disclosure says, what happens
    after the Barion redirect (success page, failure/cancel path,
    timeout), and how the state reads while the payment is `Started`.
16. Does the Meta purchase tracking (server-side Conversions-API event
    with the stored handle, deduped by `event_id`) ship with this work or
    as a follow-up?

### Multi-market (epic 9 boundary)

17. EUR: does the wallet get a EUR account now, and does anything in the
    payment design assume HUF-only?
18. The 6 000 Ft deposit is a Hungary rule — is the deposit amount a
    delivery-option property, a channel property, or per-market data?

### Build vs. adopt (new, 2026-11-15)

19. Custom Vendure Barion handler vs Számlázz.hu's own Online fizetés:
    Számlázz.hu's online-payment feature already runs on **Barion** (and
    SimplePay) and auto-completes the paid díjbekérő → invoice → IPN
    chain without any custom gateway code — at the cost of the checkout
    redirect living in Számlázz.hu's flow instead of ours (weaker UX
    control, no `Payment/Start`-level payer data for SCA pass rates, no
    deposit-branch payment metadata on the order). Do we build the
    custom handler at all, or ship the thin integration first and
    revisit? ([szamlazz-api.md](../szamlazz-api.md) §8.)
