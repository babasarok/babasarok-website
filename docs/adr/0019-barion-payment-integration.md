# ADR 0019 — Barion payment integration

Status: **draft** — a record of what we know and the questions we must
answer before starting. No decision is made here yet; this ADR becomes a
proposal only when the questions in the last section have answers.

Part of epic 7 (Barion payment provider, tax, NAV invoicing). The owner's
post-order flow this serves is recorded in
[docs/roadmap.md](../roadmap.md) (Owner post-order flow).

## Context

Today no payment is native. Orders stop at `ArrangingPayment` (the
`QuoteOrderPlacedStrategy` marks them placed — ADR 0013 decision 5);
prod (2026-11-13) holds placed orders, 0 payments. Epic 6 has since added
the multi-step checkout with the structured address and the Számlázás step
(billing address, `taxNumber`), so the checkout is ready for a payment
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

## What we know about Barion (verified 2026-11-13)

Sources: docs.barion.com (Payment-Start-v2, Responsive web payment,
Sandbox, Making a test payment, FundingSources, Callback mechanism,
Barion Shop Authentication, Supported currencies, List of API endpoints,
Going live, Security Measures).

### The API

- Public REST API (Barion Smart Gateway). Payments on
  `POST /v2/Payment/Start`; authoritative state on
  `GET /v4/Payment//PaymentState` (the v2 `GetPaymentState` is
  deprecated); `FinishReservation`, `Capture`, `CancelAuthorization`,
  `Refund` for the reservation/capture/refund surface.
- Auth is the shop's POSKey (GUID), sent in the request body on v2
  endpoints. Optional HMAC-SHA512 signing of requests and of Barion's
  callback messages (`x-timestamp`/`x-nonce`/`x-signature-sha512`).
- Flow: `Payment/Start` (POSKey, `PaymentType: Immediate | Reservation |
DelayedCapture`, `PaymentRequestId`, `FundingSources`, `Currency`,
  `RedirectUrl`, required `CallbackUrl`, `Transactions[]` with `Payee`,
  `Total`, `Items`) → the response carries `GatewayUrl`, the buyer pays
  on `secure.barion.com`, is redirected back with the paymentId. Barion
  POSTs a callback to `CallbackUrl` on every state change — a signal only
  (`paymentId`); respond HTTP 200 within 15 s, Barion retries 5 times;
  polling instead of callbacks can get the shop suspended. The callback's
  state is never trusted — the server re-queries `PaymentState` and
  branches on that. Idempotency keys are supported on requests (relevant
  for `Payment/Start` retries).
- `Payment/Start` accepts 3DS-related payer data (name, e-mail, phone,
  shipping address); sending it raises SCA pass rates.
- Refunds: `POST /v2/Payment/Refund` on `Succeeded` payments, full or
  partial per transaction. No `Payment/Finish` — the endpoints are
  `FinishReservation` (per-transaction amounts, partial finish
  auto-refunds the difference, up to 365 days) and `Capture` (7 days,
  21 days for Hungarian shops) plus `CancelAuthorization`.

### Payment methods

Per-payment `FundingSources` flags:

| Value          | Method                | Notes                                                                               |
| -------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `Balance`      | Barion wallet balance | cannot be disabled                                                                  |
| `BankCard`     | Bank card             | guest or Barion user                                                                |
| `GooglePay`    | Google Pay            | guest only, capable devices; **gated by the merchant's contract**, not the API call |
| `ApplePay`     | Apple Pay             | guest only, capable devices; same contract gate                                     |
| `BankTransfer` | Online bank transfer  | ⚠️ "no longer supported" as of 2026-01-09, replacement being sought                 |

No PayPal, no iDEAL. QR Platba is CZK-only. The deprecated bank-transfer
source confirms the roadmap's design: the bank-transfer branch stays
manual (díjbekérő → AutoKassza), outside Barion.

### Currencies

HUF, EUR, CZK, USD, RON, PLN — one per payment, and the merchant's wallet
must hold an account in that currency. Minimums apply (HUF 10 Ft).
HUF has no decimal digits (matches `ForintMoneyStrategy`).

### Test environment

- `api.test.barion.com` + `secure.test.barion.com`; a completely separate
  environment from production (separate wallet, nominal funds only).
- Self-serve (unlike GLS): register, create a shop, the POSKey is
  generated automatically and sandbox shops are approved automatically
  (live shops need human approval).
- Card payments are a simulator: any future expiry, any CVC. The
  per-currency minimums apply in tests too.
- Recurring/token payments are enabled by default in the sandbox.

### SDK and plugin landscape

- No official Node SDK (official libraries are PHP and mobile).
- Community `node-barion` (npm, MIT, v4.0.0, 2026) covers the full
  gateway surface.
- **No Vendure Barion plugin exists** (GitHub and the Vendure plugin
  catalogs: nothing) — the integration is a custom `PaymentMethodHandler`
  - callback controller, written from scratch; the Mollie plugin is the
    closest behavioral reference.

### Onboarding

- Online registration is the contract (no paperwork); the live shop
  requires human KYC/company approval (AML). Business wallets start with
  reduced limits until full due-diligence; the gateway keeps working
  either way.
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
  paid at placement, remainder collected on delivery). Which earlier
  states accept partial payment, and what each of them must therefore
  allow, is not yet known — see question 1.
- **The deposit is an invoice-flow fact, not just a payment amount:** the
  6 000 Ft exists because the owner issues an előlegszámla for it, and
  the végszámla only when the product is done. The amount of the Barion
  payment and the invoice branch are the same decision.
- **Számlázz.hu's auto-előlegszámla is unusable** (recorded in the
  roadmap): the rule is per-account, not per-branch, so a paid
  full-total díjbekérő would get a deposit invoice too. Telling the two
  branches apart needs invoice prefixes (előtagok) or our own logic.
- **The COD remainder's money confirmation is bank-side:** AutoKassza
  pairs the bank statement line via the parcel's `CODReference` (ADR 0018) and notifies the owner. There is no hook from that notification
  into the backend today; GLS's own statuses are only a proxy for the
  money.
- **Manual payments are only addable in two states** (verified
  2026-11-13, `OrderService.addManualPaymentToOrder`): the dashboard's
  manual-payment action returns `ManualPaymentStateError` unless the
  order is in `ArrangingPayment` or `ArrangingAdditionalPayment`. Two
  consequences: the bank-transfer branch works today _because_ orders
  sit in `ArrangingPayment`; and once the deposit moves an order to
  `PaymentAuthorized`, the COD remainder can be recorded only after the
  order enters `ArrangingAdditionalPayment` — where the action computes
  the amount itself as the outstanding deficit
  (`totalWithTax − totalCoveredByPayments`), so the deposit must already
  be a recorded `Payment` on the order.
- **Multiple payments per order are native** (same code path): the
  coverage guard sums across all `Payment` rows, so deposit + COD
  remainder can be two `Payment`s on one order — only their labeling
  (handler / metadata) is ours to design (question 2).
- **A complete state path exists for the deposit branch, but it leans on
  guard quirks** (all verified in the 3.8.1 source): `ArrangingPayment →
PaymentAuthorized` needs `checkPaymentsCoverTotal` relaxed (the 6 000
  Ft deposit alone cannot cover); `PaymentAuthorized → Shipped` has no
  direct edge — the working hop is through `Modifying`, whose exit guard
  is vacuous with zero modifications, because
  `ArrangingAdditionalPayment`'s exit demands full coverage; the COD
  remainder then records inside `ArrangingAdditionalPayment` (see above)
  and the order settles. Question 1 must decide whether to keep this hop
  sequence or design custom states instead.
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
  plugin path.** Nothing to buy or adopt; a small typed client (ADR
  0018's GLS-client pattern) or `node-barion` — an implementation choice,
  not a design question.

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

4. What does the Számlázz.hu API support of what the flow needs:
   díjbekérő, előlegszámla, végszámla with the deposit set-off (előleg
   beszámítása), payment-method switching (átutalás ↔ utánvét),
   line-itemized payment requests, the configurable (+3-day) deadline,
   invoice prefixes?
5. When a Barion payment succeeds, which invoice fires — and what is the
   rule that tells the deposit branch from the full-total branch (the
   per-account auto-előlegszámla setting cannot)? Is the first version
   automated at all, or does the owner issue invoices by hand against
   recorded payments?
6. Where does NAV/online-számla and the 27% ÁFA setup interact with this
   (the roadmap's tax note) — does the Barion leg change what the
   invoice must show?

### Payment-confirmation notifications (AutoKassza)

7. Does Számlázz.hu or AutoKassza expose an API/webhook for payment
   pairing or díjbekérő payment events? (Needs research.)
8. If yes: do we listen — it would serve the bank-transfer branch too
   (recording the payment on the order automatically) — or does the
   manual dashboard action stay? If no: is the manual dashboard action
   the permanent answer for the COD remainder?

### Barion-side choices

9. Which funding sources do we enable at first ship (card only?
   +wallet? Google/Apple Pay depending on the merchant contract), and
   what does the buyer-facing payment-method list look like per delivery
   option?
10. What does the deposit payment show on the Barion gateway: a 6 000 Ft
    payment, or the full order with a partial transaction — and which do
    we want the buyer to see?
11. `PaymentType: Immediate` for both branches, or does a
    reservation/capture shape serve a story we have not identified? One
    such story exists, from the API facts above: `Reservation` could
    authorize the **full** total at placement and capture in two steps —
    `FinishReservation` takes per-transaction amounts, a partial finish
    auto-refunds the difference, and its window is up to **365 days**
    (unlike `Capture`'s 7 days / 21 days for HU shops — too short for
    made-to-order lead times). That shape would make the COD remainder
    electronic — the courier never touches money, and the
    deposit-vs-remainder state problem collapses into one authorized
    payment — at the cost of authorizing the full amount on the buyer's
    card at placement. A product decision, not a technical one; it also
    changes what the COD delivery option means for the buyer.
12. Refund/chargeback policy: who issues refunds and when, and how does
    a Barion refund map to számla corrections (Számlázz.hu
    stornó)?
13. Callback endpoint on the deployed backend: URL per environment
    (previews, prod), HMAC key adoption (yes/no), the 15 s budget under
    the worker's load.
14. The merchant's live onboarding steps and their timing (KYC approval
    latency) — when does the owner apply, and what contract extras
    (Google Pay, token payments) does she ask for?

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
