# ADR 0020 — GLS labels via the MyGLS API

Status: proposed

Part of epic 6 (native delivery methods). The owner's post-order flow this
serves is recorded in [docs/roadmap.md](../roadmap.md).

## Context

Today the owner creates GLS labels by hand in MyGLS (mygls.hu): after an
order is placed she issues a díjbekérő, waits for the payment (AutoKassza
pairs the bank line and notifies her), issues the invoice, then creates and
saves the label unprinted so the delivery data is ready when the product is
done. The backend has never gone past Vendure's `ArrangingPayment` state:
prod (2026-11-13) holds 7 placed orders, 0 payments, 0 fulfillments.
Everything a label needs is already captured at checkout (the structured
address with the house number in `streetLine2`, the recipient's `fullName`
and `phoneNumber`) — no site changes are needed for the label work.

## Priorities (ranked)

1. **No real parcels outside production** — dev, previews and automated
   tests never touch the live GLS account.
2. **Money truth stays external** — GLS and the bank (AutoKassza) confirm
   payment, never the label pipeline; `Delivered` must imply fully paid.
3. **Native Vendure seams** — the fulfillment handler, the fulfillment's
   `trackingCode`, the dashboard's own actions; no bespoke order plumbing.
4. **Implementation details don't leak** — the MyGLS wire format, hashing
   and URL scheme stay inside one plugin.
5. **Slovakia later is configuration** — a second market must not require
   code changes (epic 9).

## Options

- **Do nothing / not now** — keep creating labels in MyGLS by hand. Works
  today, zero risk, but the label step stays manual for every order and
  epic 7's delivery-tied settlement has no event to listen to. Rejected as
  the target, kept as the fallback.
- **GLS ShipIT (group-wide REST/SOAP)** — publicly documented, but Hungary
  is served by the MyGLS API instead (the ShipIT docs note HU has no
  dedicated Contact IDs), its base URL is handed out only with
  credentials, there is no public test environment, and SOAP would be
  needed for some flows. Rejected.
- **The MyGLS API (api.mygls.hu) — chosen.** GLS Hungary's own integration
  surface, REST/JSON first-class, public developer docs + samples, a test
  environment (`api.test.mygls.hu`), per-country domains that cover SK for
  epic 9, and the owner's existing MyGLS credentials already authenticate
  on it.

## Decision

1. **A full-fledged plugin at `backend/src/plugins/gls/`.** The MyGLS REST
   client (typed TS; the doc's C#/PHP/Java samples are reference-only and
   GLS asks production integrations to implement their own client), the
   account configuration, one fulfillment handler, the status-polling job
   and admin-API extensions for the dashboard. Wire format, SHA-512
   password hashing and URL scheme never leave the plugin.
2. **Accounts are env-backed** (values from the stack's `.env`): the
   client number, username and password per account, plus the label
   format (`GLS_LABEL_FORMAT`, `A4_2x2` by default — what the owner prints
   on is still open). The sender (pickup) address is not an env value: it
   comes from Vendure settings, so the owner can edit it (owner decision
   2026-11-19): the channel's **GLS feladó** custom field, next to the
   channel's other owner settings (order-email sender, owner mailbox) —
   per channel, so per market. Decided against a DB
   entity for the accounts: handler registration and the
   handler-arg dropdowns are boot-time static, so runtime-addable accounts
   would buy nothing; adding an account is a config entry + deploy. The
   handler validates its `account` arg against the configured list.
3. **Delivery options stay native ShippingMethods** (eligibility checker +
   calculator, dashboard-editable, channel-scoped). The plugin contributes
   the fulfillment piece, not the options.
4. **Label creation in the fulfillment handler.** The owner fulfills when
   the product is done (owner decision 2026-11-19 — the delivery data
   already lives in Vendure, so MyGLS's "saved unprinted" step has no
   job). `createFulfillment` calls `PrintLabels` (one step) with the
   order's address and, on utánvét orders, `CODAmount` = total − recorded
   payments (`CODReference` carries the order code — GLS's own "payment
   pairing" reference); it returns the parcel number as the fulfillment's
   native `trackingCode` and keeps the GLS `ParcelId` (needed to delete
   the label). GLS returns the PDF only in that response, so the handler
   saves it in a private plugin table served only through an
   admin-permission endpoint (owner decision 2026-11-19 — Vendure assets
   are publicly served, and the PDF carries the buyer's address). GLS
   does not deduplicate, so two guards keep one order from getting two
   parcels: the client never retries label creation, and the handler
   refuses when the order already has a non-cancelled GLS fulfillment.
5. **Shipped → delivered via a polling worker, under one rule: deliver
   only when the order's payments cover the total.** The MyGLS API has no
   webhooks — polling `GetParcelStatuses` is the only tracking mechanism.
   The worker transitions only the fulfillment: Vendure's default
   fulfillment process moves the order to `Shipped`/`Delivered` itself
   once that order state is reachable.
   Prepaid orders deliver on GLS status 5 (delivered); COD orders hold in
   `Shipped` until the COD payment is recorded — the order's `Delivered`
   state can only transition to `Cancelled`, so delivering an unsettled
   COD order would dead-end the settle leg (`Shipped → Modifying →
PaymentSettled`). This makes `Delivered` an invariant: fully paid and
   physically delivered.
6. **COD money confirmation stays bank-side.** The API has no
   payout/settlement surface; GLS status 5 is only a proxy for the money.
   AutoKassza pairs the bank statement line via the parcel's
   `CODReference`, and the owner records the payment in the dashboard.
7. **Test modes, chosen from the environment only** (`glsConfigFromEnv`):
   `live` only when `NODE_ENV=production` (previews run `development`,
   hard-coded in their compose file) and only from `MYGLS_HU_*`; prod
   fails to boot without them. Outside production `MYGLS_HU_*` is never
   read: `TEST_MYGLS_HU_*` selects `test` (`api.test.mygls.hu`), and no
   credentials select the in-process **fake** (sequential parcel ids, a
   generated valid placeholder PDF), used by unit tests and the CI
   integration suite. The host is derived from the mode — there is no
   URL override. The real-network check is a hand-run smoke test against
   the test environment (`GLS_SMOKE=1`, see `docs/agents/testing.md`)
   that deletes every parcel it creates.

## Verified facts (2026-11-13, 2026-11-19)

- **Test-env credentials (verified 2026-11-19):** GLS provisioned the
  account on the test environment; `GetParcelStatuses` on
  `api.test.mygls.hu` with the test trio (`TEST_MYGLS_HU_{EMAIL,PASSWORD}`
  in `backend/.env`) returned the account-scoped
  `ErrorCode: 26 "Parcel not found with current settings"` for a fabricated
  parcel number, while a deliberately wrong password returned
  `Unauthorized.` (`ErrorCode: -1`) — authentication works, S4 is
  unblocked. The test account id rides in `TEST_MYGLS_HU_ACCOUNT_ID`.
- **Live credentials:** GLS confirmed (2026-11-19) that the owner's MyGLS
  web login (email + password) is the credential set for the live API.
  It authenticates there — `GetParcelStatuses` returned the
  account-scoped `ErrorCode: 5 "Access denied for this parcel ID"`, not
  `Unauthorized.` (GLS's published demo credentials return
  `Unauthorized.`, so per-account API access is enforced). The account id (`100021942`) is not part of
  authentication; it rides per-parcel as `ClientNumber` (9-digit, like the
  doc's sample).
- **Wire format:** in JSON, `Password` is the SHA-512 digest as a
  64-number array (base64 only in XML mode — the server's deserializer
  rejects base64 in JSON); datetimes are WCF `\/Date(ms)\/` strings; every
  response is a JSON envelope with an error list.
- **Test-environment behavior (probed 2026-11-19, all parcels deleted):**
  `PrintLabels` requires `WebshopEngine` (error 56, missing from the
  doc's error table); `CODAmount` alone prints "Utánvét: N HUF" on the
  label — no `COD` service entry needed; `Content` prints on the label;
  neither `GetPrintedLabels` nor `GetPrintData` returns an existing
  label (error 18 "already generated") — the PDF exists only in the
  `PrintLabels` response; a repeated `ClientReference` creates a second
  parcel (no deduplication); a parcel not yet handed over answers
  `GetParcelStatuses` with error 26 (the worker reads it as "not handed
  over yet"); deleting twice answers error 4.
- **Fulfilling needs a settled order** (Vendure dashboard 3.8.1
  `canAddFulfillment`): the dashboard offers "Fulfill order" only when the
  order can move to `Shipped`/`PartiallyShipped`/`Delivered`, i.e. from
  `PaymentSettled`, and preselects the shipping method's
  `fulfillmentHandlerCode`. Prepaid orders reach it once the owner records
  the bank transfer; utánvét orders (deposit only) cannot until epic 7's
  payment states land — the handler supports COD and is tested through
  the fake meanwhile, and the owner keeps making COD labels in MyGLS.
  `OrderService.createFulfillment` itself has no order-state guard.
- **State machine guards** (Vendure 3.8.1 `default-order-process.js`):
  `PaymentAuthorized`/`PaymentSettled` require full payment coverage
  (`checkPaymentsCoverTotal`), `Shipped`/`Delivered` require fulfillments
  in the matching states, `Delivered.to = [Cancelled]`, and
  `ArrangingAdditionalPayment`'s exit requires full coverage (the settle
  leg goes through `Modifying`). A 6 000 Ft deposit cannot enter
  `PaymentAuthorized` under defaults — the payment-state design (relax the
  option vs a custom state) belongs to epic 7's Barion work, not this ADR.

## Owner decisions (2026-11-19)

- **Credentials reach deployments as Cloudflare build variables**: the
  Production set holds `MYGLS_HU_*` (live), the Preview set
  `TEST_MYGLS_HU_*` (test); the deploy writes them per stack into the
  stack's `.env.cloudflare`, allowlisted (a preview never receives the
  live keys). Rotation: edit in Cloudflare, then redeploy — the live
  password is the owner's MyGLS web password, so changing it there breaks
  label creation until the variable follows.
- **Cancelling a GLS fulfillment deletes the parcel in GLS**; when GLS
  refuses (e.g. already handed over), the cancel is blocked with GLS's
  reason.
- **The stored label PDF is dropped** once the fulfillment is delivered or
  cancelled; later reprints go through MyGLS.
- **The buyer's phone and email** go to GLS as the delivery contact; no
  extra GLS services (plain parcel, plus COD on utánvét).
- **Polling every 30 minutes**; on a delivery problem (no cash, refused,
  returned, wrong address) the worker emails the owner once and records
  it on the order — it never cancels anything.
- **The buyer gets a "shipped" email** with the GLS tracking link when the
  parcel is handed over (fulfillment → `Shipped`), in the order's
  language.

## Rollout plan

1. **S1 Client + fake** (done) — the typed `GlsClient` interface
   (create/delete label), the REST client, the in-memory fake and the
   env-only mode selection; unit tests, plus the hand-run test-env smoke
   test.
2. **S2 Plugin + handler** — S2a (done): the env wiring and the
   per-stack deploy plumbing. S2b (done): the `gls` fulfillment handler
   (label + COD, one label per order, cancel deletes at GLS), the private
   `gls_parcel` table and the `glsLabel` admin query, the channel's GLS
   sender, the migration switching the GLS delivery methods to the `gls`
   handler; backend integration test against the fake
   (`backend/integration/gls-labels.test.ts`), behavior in
   [the gls-labels spec](../specs/gls-labels.md). S2c (done): the order
   page's "GLS-címke" block downloading the label PDF
   (`backend/src/dashboard/gls/gls.tsx`).
3. **S3 Polling worker** — next. A Vendure `ScheduledTask` every 30
   minutes (core 3.8.1 ships `ScheduledTask`; tasks only run with
   `DefaultSchedulerPlugin` registered — the default strategy is a no-op)
   polls the live parcels of this mode (`gls_parcel` rows not deleted,
   fulfillment not `Delivered`/`Cancelled`) with `GetParcelListStatuses`
   (≤100 per call; a not-yet-handed-over parcel answers error 26). A pure
   decision maps the status history to: `Shipped` on hand-over (status 1
   and later transit codes); `Delivered` on 5/54/58/92 only when the
   order's payments cover the total (COD orders hold in `Shipped` until the
   owner records the COD payment); a one-time owner email on problem codes
   (16 no cash, 17 refused, 20 address, 23/40 returned). The worker moves
   only the fulfillment (Vendure moves the order). On `Delivered` the
   stored PDF is dropped. The buyer's "shipped" email (hu/en templates,
   with the GLS tracking link — the public tracking URL format still to be
   verified) fires on the fulfillment's transition to `Shipped`. The fake
   keeps per-process state, so the worker in fake mode sees no parcels:
   the decision is unit-tested, the poll loop gets an integration test
   that injects statuses.
4. **S4 Test-env round-trip** — test access is provisioned and verified
   (2026-11-19): `PrintLabels` → PDF → `DeleteLabels` on
   `api.test.mygls.hu`.
5. **S5 Live verification (done-condition, owner-run)** — one real label
   created through the finished plugin's path, checked in MyGLS, deleted.
   Development never touches live; without this step nothing proves her
   contract issues labels with the services and COD behavior she needs.

## Open questions (design/implementation time)

- `TypeOfPrinter` — what the owner prints on (`GLS_LABEL_FORMAT`:
  `A4_2x2` default, `A4_4x1`, `Thermo`; only `A4_2x2` is verified).
- The COD max in her contract (the doc validates a per-product max).
- Whether her client number requires parcel weights (optional by default;
  if required, they get modeled like pricing: base weight + per-field
  additional weights in the canonical definition).
