# ADR 0019 — Barion payment integration

Status: **draft**

Part of epic 7 (Barion payment provider, tax, NAV invoicing). The owner's
post-order flow this serves is recorded in
[docs/roadmap.md](../roadmap.md) (Owner post-order flow). The Barion API
facts below are verified against the developer docs (2026-11-13), but this
ADR is a draft on purpose: the payment flow has to be refined a lot more
before it is proposed, and several problems are already known to have no
easy answer (the section after Priorities). Nothing here is settled.

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

## Verified Barion facts (2026-11-13)

Sources: docs.barion.com (Payment-Start-v2, Responsive web payment,
Sandbox, Making a test payment, FundingSources, Callback mechanism,
Barion Shop Authentication, Supported currencies, List of API endpoints,
Going live, Security Measures).

- **Public REST API** (Barion Smart Gateway). Payments on
  `POST /v2/Payment/Start`; authoritative state on
  `GET /v4/Payment//PaymentState` (the v2 `GetPaymentState` is
  deprecated); `FinishReservation`, `Capture`, `CancelAuthorization`,
  `Refund` for the reservation/capture/refund surface.
- **Auth is the shop's POSKey** (GUID), sent in the request body on v2
  endpoints. Optional **HMAC-SHA512** signing of requests and of Barion's
  callback messages (`x-timestamp`/`x-nonce`/`x-signature-sha512`).
- **Flow:** `Payment/Start` (POSKey, `PaymentType: Immediate | Reservation |
  DelayedCapture`, `PaymentRequestId`, `FundingSources`, `Currency`,
  `RedirectUrl`, required `CallbackUrl`, `Transactions[]` with `Payee`,
  `Total`, `Items`) → the response carries `GatewayUrl`, the buyer pays on
  `secure.barion.com`, is redirected back with the paymentId. Barion
  **POSTs a callback to `CallbackUrl` on every state change** — a signal
  only (`paymentId`); respond HTTP 200 within 15 s, Barion retries 5
  times; polling instead of callbacks can get the shop suspended. The
  callback's state is never trusted — the server re-queries `PaymentState`
  and branches on that.
- **Funding sources** (per payment): `BankCard`, `Balance` (Barion wallet,
  cannot be disabled), `GooglePay`/`ApplePay` (guest only; **gated by the
  merchant's contract**, not the API call), `BankTransfer` —
  ⚠️ **"no longer supported" as of 2026-01-09**, replacement being sought.
  No PayPal, no iDEAL. QR Platba is CZK-only. The deprecated
  bank-transfer source **confirms the roadmap's design: the bank-transfer
  branch stays manual (díjbekérő → AutoKassza), outside Barion.**
- **Currencies:** HUF, EUR, CZK, USD, RON, PLN — one per payment, and the
  merchant's wallet must hold an account in that currency. Minimums apply
  (HUF 10 Ft). HUF has no decimal digits (matches `ForintMoneyStrategy`).
- **Refunds:** `POST /v2/Payment/Refund` on `Succeeded` payments, full or
  partial per transaction.
- **Test environment (self-serve, unlike GLS):** `api.test.barion.com` +
  `secure.test.barion.com`; register, create a shop, the POSKey is
  generated automatically and **sandbox shops are approved automatically**
  (live shops need human approval). Card payments are a simulator: any
  future expiry, any CVC. A completely separate environment from
  production (separate wallet, nominal funds only). Same per-currency
  minimums apply in tests.
- **SDK/plugin landscape:** no official Node SDK (official libraries are
  PHP and mobile). Community `node-barion` (npm, MIT, v4.0.0, 2026)
  covers the full gateway surface. **No Vendure Barion plugin exists**
  (GitHub and the Vendure plugin catalogs: nothing) — the integration is
  a custom `PaymentMethodHandler` + callback controller, written from
  scratch; the Mollie plugin is the closest behavioral reference.
- **Onboarding:** online registration is the contract (no paperwork); the
  **live shop requires human KYC/company approval** (AML); business
  wallets start with reduced limits until full due-diligence. Fees are
  package-based (barion.com price calculator), deducted from the merchant
  balance.

## Priorities (ranked)

1. **The owner's flow must not get worse.** Whatever ships, the deposit
   branch (6 000 Ft now, remainder on delivery) and the bank-transfer
   branch (full díjbekérő) must both keep working end-to-end; automation
   only replaces manual steps where it branches correctly on the payment
   method.
2. **Money truth stays external** — Barion's `PaymentState` (re-queried
   server-side) is the only truth for the Barion leg; AutoKassza/bank
   pairing is the truth for the COD remainder. Never the redirect, never
   the buyer's browser.
3. **No real money outside production** — the sandbox (`api.test.barion.com`)
   is the developer surface; the in-process fake (if needed) only where
   the testing rules demand it (see ADR 0018's test-mode structure).
4. **Native Vendure seams** — payment methods, `Payment`s, the order
   process and the dashboard's own actions; no bespoke order plumbing.
5. **Implementation details don't leak** — the Barion wire format, POSKey,
   HMAC and URL scheme stay inside one plugin.
6. **Slovakia later is configuration** — EUR/second market must not
   require code changes (epic 9).

## Known hard problems (why this draft is not yet an accepted ADR)

### 1. Utánvét is one Barion payment and one physical payment

A CardPaymentBarion order pays only the 6 000 Ft deposit through Barion;
the remainder is collected in cash by the courier. That means:

- The Barion leg is a **partial payment** (6 000 of, say, 50 000). The
  default `checkPaymentsCoverTotal` guard (verified in ADR 0018) blocks
  `PaymentAuthorized`/`PaymentSettled` until payments cover the full
  total, so the order **cannot reach any settled state at placement**.
  The roadmap's sketch (Shipped → Modifying → PaymentSettled once the COD
  payment is recorded) is direction, not a design. Open: relax
  `configureDefaultOrderProcess` vs. a custom order state; what the
  dashboard shows the owner at each step; how `PaymentSettled` is tied to
  the COD recording without dead-ending `Delivered` (the
  `Delivered.to = [Cancelled]` constraint from ADR 0018).
- Two payments on one order must be **distinguishable** (Barion deposit
  vs. COD remainder) for the owner's invoice branch and for refunds.

### 2. This work cannot be isolated from the Számlázz.hu work

The 6 000 Ft deposit exists only because the owner's flow issues an
**előlegszámla** for it. Once Barion collects the deposit at placement,
the invoice questions are no longer separable:

- When the Barion payment succeeds, which számla fires? (Full-total
  branch → végszámla-style invoice; deposit branch → előlegszámla.)
  The rule must branch on the payment method/amount, and the roadmap
  records that Számlázz.hu's per-account auto-előlegszámla setting
  cannot tell the branches apart (invoice prefixes may).
- A Barion-only slice that ships without an invoicing answer would leave
  the owner issuing the deposit invoice by hand against a payment she
  already got notified about — a strictly worse variant of today's
  manual flow, not an improvement.

So epic 7's Barion and Számlázz.hu (and the tax/NAV work) are **one
refinement, sliced for rollout but designed together**. The slicing
(open) must still let the sandbox integration proceed independently.

### 3. Payment-paired notifications (AutoKassza) have no hook today

For the COD remainder the money confirmation is bank-side: AutoKassza
pairs the bank statement line via the parcel's `CODReference` (ADR 0018)
and notifies the owner. The dashboard can record the payment manually —
but the roadmap's automation asks whether that notification can reach
Vendure from somewhere. Open (needs research, not answered here):

- Does Számlázz.hu/AutoKassza expose an API/webhook for payment pairing
  or díjbekérő payment events?
- If yes, is it worth listening (it would serve the bank-transfer branch
  too — recording the payment on the order automatically), or does the
  manual dashboard action stay?
- The roadmap currently keeps AutoKassza outside Vendure "unless the
  owner asks to replace it" — this ADR must decide that for the COD
  remainder leg, because the settle-on-delivery trigger depends on it.

### 4. Checkout/UX shape is unrefined

How the buyer chooses (epic 6 splits the combined payment+delivery
options): which payment methods appear (Barion card, Barion wallet,
Google Pay/Apple Pay — contract permitting —, utánvét-deposit, bank
transfer), what the "6 000 Ft deposit is collected now" disclosure looks
like, and what the post-redirect checkout does while the payment is
`Started`. The Meta purchase-tracking handle (roadmap design note) rides
on this work's confirmation point.

## Preliminary direction (draft — subject to refinement)

- **A full-fledged plugin at `backend/src/plugins/barion/`** (the ADR
  0018 shape): typed REST client, plugin options (env-backed:
  POSKey, payee e-mail, redirect/callback URLs, mode, funding sources),
  the payment method handler(s), the callback controller, admin-API
  extensions for the dashboard.
- **`PaymentType: Immediate`** for both branches (the deposit is a
  full capture of a smaller amount; reservation/capture is for a
  cancel/underspend story we have not identified — revisit).
- **The sandbox is the default dev/test mode** (`live`/`test` like the
  GLS plugin's `mode`); the shop's registration in the sandbox is the
  first rollout step since it is self-serve.
- **Client:** small typed TS client in the plugin (like ADR 0018's GLS
  client), with `node-barion` as a fallback if the hand-rolled client
  grows; the choice is made at implementation time.

## Rollout plan (sketch — ordering is an open question, see below)

1. **S0 Sandbox accounts** — sandbox wallet + shop for the owner
   (self-serve), live shop application (KYC) started in parallel.
2. **S1 Client + plugin skeleton** — typed client, callback controller
   (HMAC verify + re-query `PaymentState`), backend integration test
   against the sandbox.
3. **S2 Payment methods + order-state design** — the deposit-vs-full
   decision (Known problem 1) and the checkout payment step; this is
   where Számlázz.hu refinement happens (Known problem 2).
4. **S3 Invoice flow** — díjbekérő/előlegszámla/végszámla automation with
   the payment-method branch (needs S2's outcome and possibly the
   AutoKassza research from Known problem 3).
5. **S4 Sandbox round-trip + live verification (done-condition,
   owner-run)** — one real sandbox payment per branch; then one real
   live payment per branch checked in the dashboard and refunded.
   Development never touches the live API.

The slice order in particular is not settled: whether Számlázz.hu
refinement (S3) precedes Barion (S1–S2) or the branches ship
prepaid-only first.

## Open questions (design time — this ADR is draft until these close)

- Order-state design for the deposit branch (relax the guard vs. custom
  state vs. a different settlement shape) and its dashboard behavior.
- Does the deposit Barion payment's `Total`/`PaymentRequestId`/`Items`
  show the 6 000 Ft only, or the order with a partial transaction — and
  what does the buyer see on the Barion gateway either way?
- Számlázz.hu API capability check (díjbekérő, előlegszámla, végszámla,
  előleg beszámítása, payment-method switching, invoice prefixes) and the
  AutoKassza pairing webhook/API question (Known problem 3).
- Funding sources to enable at first ship (card only? +wallet?
  Google/Apple Pay depend on the merchant contract) and the buyer-facing
  payment-method list per delivery option.
- Callback endpoint on the deployed backend (previews, prod URLs,
  HMAC key adoption, the 15 s budget under the worker's load).
- EUR for epic 9: wallet account in EUR, `ForintMoneyStrategy` precision
  (roadmap epic-9 notes).
- Refund and chargeback policy (who issues refunds, when) and how
  `Payment/Refund` maps to the owner's számla corrections.
- Whether the Meta purchase tracking (roadmap design note) ships with
  this work or as a follow-up.
