# ADR 0018 — GLS labels via the MyGLS API

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
2. **Accounts are env-backed plugin options** (`GlsPlugin.init({
accounts })`, values from the stack's `.env`): `{ id, country,
clientNumber, username, apiPassword, pickupAddress, typeOfPrinter,
mode }`. Decided against a DB entity: handler registration and the
   handler-arg dropdowns are boot-time static, so runtime-addable accounts
   would buy nothing; adding an account is a config entry + deploy. The
   handler validates its `account` arg against the configured list.
3. **Delivery options stay native ShippingMethods** (eligibility checker +
   calculator, dashboard-editable, channel-scoped). The plugin contributes
   the fulfillment piece, not the options.
4. **Label creation in the fulfillment handler.** `createFulfillment`
   calls `PrintLabels` (one step) with the order's address, the `COD`
   service and `CODAmount` = total − deposit on utánvét orders
   (`CODReference` carries the order code — it is GLS's own "payment
   pairing" reference), stores the returned PDF, and returns the parcel
   number as the fulfillment's native `trackingCode`.
5. **Shipped → delivered via a polling worker, under one rule: deliver
   only when the order's payments cover the total.** The MyGLS API has no
   webhooks — polling `GetParcelStatuses` is the only tracking mechanism.
   The worker transitions the fulfillment and then the order
   (`FulfillmentService.transitionToState` does not move the order).
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
7. **Test modes.** `live` (prod only), `test` (`api.test.mygls.hu` — the
   doc's stated testing/development surface; accounts must be provisioned
   on it by GLS) and an in-process **fake** (deterministic parcel numbers
   from the `ClientReference`, a generated valid placeholder PDF, scripted
   status progression) used by unit tests, the CI integration suite, and
   as the interim until test-env access exists. Absent credentials default
   to `fake`; prod fails to boot if its credentials are missing. The only
   real-network check is a hand-run smoke script gated behind
   `GLS_SMOKE_API_URL` (read-only), like the catalog contract test.

## Verified facts (2026-11-13)

- **Credentials:** the owner's MyGLS web login (email + password)
  authenticates on the live API — `GetParcelStatuses` returned the
  account-scoped `ErrorCode: 5 "Access denied for this parcel ID"`, not
  `Unauthorized.` (GLS's published demo credentials return
  `Unauthorized.`, so per-account API access is enforced). No separate API
  credential set is known to be needed; whether it is _allowed_ is part of
  the GLS email. The account id (`100021942`) is not part of
  authentication; it rides per-parcel as `ClientNumber` (9-digit, like the
  doc's sample).
- **Wire format:** in JSON, `Password` is the SHA-512 digest as a
  64-number array (base64 only in XML mode — the server's deserializer
  rejects base64 in JSON); datetimes are WCF `\/Date(ms)\/` strings; every
  response is a JSON envelope with an error list.
- **State machine guards** (Vendure 3.8.1 `default-order-process.js`):
  `PaymentAuthorized`/`PaymentSettled` require full payment coverage
  (`checkPaymentsCoverTotal`), `Shipped`/`Delivered` require fulfillments
  in the matching states, `Delivered.to = [Cancelled]`, and
  `ArrangingAdditionalPayment`'s exit requires full coverage (the settle
  leg goes through `Modifying`). A 6 000 Ft deposit cannot enter
  `PaymentAuthorized` under defaults — the payment-state design (relax the
  option vs a custom state) belongs to epic 7's Barion work, not this ADR.

## Rollout plan

1. **S1 Client + fake** — the typed `GlsClient` interface, the REST client
   and the in-memory fake; unit tests (wire-format serialization, error
   mapping).
2. **S2 Plugin + handler** — accounts, the `gls` fulfillment handler
   (label + COD), the dashboard admin extension; backend integration test
   (real Vendure server, fake GLS).
3. **S3 Polling worker** — statuses, the deliver-when-settled rule,
   `trackingCode` handling.
4. **S4 Test-env round-trip** — once GLS provisions the test account:
   `PrintLabels` → PDF → `DeleteLabels` on `api.test.mygls.hu`.
5. **S5 Live verification (done-condition, owner-run)** — one real label
   created through the finished plugin's path, checked in MyGLS, deleted.
   Development never touches live; without this step nothing proves her
   contract issues labels with the services and COD behavior she needs.

The GLS email to send meanwhile (drafted; also linked from
[external-services.md](../external-services.md)):

> **Tárgy:** MyGLS API-integráció – az API-hozzáférés tisztázása és
> tesztkörnyezeti hozzáférés igénylése
>
> Tisztelt Ügyfélszolgálat!
>
> Webáruházunk (babasarok.net) rendeléskezelését a MyGLS API-hoz
> szeretnénk kapcsolni, hogy a csomagcímkék automatikusan készüljenek el.
> Ezzel kapcsolatban két kérdéssel fordulok Önökhöz.
>
> **1. Hozzáférés az éles API-hoz** — A MyGLS webes felületre most is
> használt belépési adatainkkal (e-mail-cím és jelszó, ügyfélazonosító: 100021942) sikerült hitelesítenünk az éles API-n (api.mygls.hu). Ehhez
> egy csak lekérdező teszthívást használtunk (csomagstátusz-lekérdezés).
> Szeretném megkérdezni, hogy az integrációnkban használhatjuk-e ezeket a
> meglévő belépési adatokat az éles API-hoz, vagy ehhez külön
> API-felhasználónevet és jelszót kell igényelnünk.
>
> **2. Hozzáférés a tesztkörnyezethez** — A fejlesztés idejére a
> tesztkörnyezetet (api.test.mygls.hu) használnánk, hogy valódi
> csomagfeladás nélkül, biztonságosan fejleszthessük és tesztelhessük az
> integrációt. Kérem, hozzák létre a fiókunkat a tesztkörnyezetben is, és
> küldjék meg a hozzá tartozó felhasználónevet, jelszót és ügyfélszámot.
> Az API-dokumentációban közölt minta belépési adatokkal nem sikerült
> hitelesíteni, ezért úgy látjuk, hogy ezek már nem érvényesek.
>
> Ha további adatra van szükségük, kérem, jelezzék.
>
> Segítségüket előre is köszönöm.
>
> Üdvözlettel:
> \<név\>
> Babasarok – babasarok.net

## Open questions (design/implementation time)

- `TypeOfPrinter` — A4 PDF (`A4_2x2`/`A4_4x1`) vs thermal; what the owner
  prints on.
- The COD max in her contract (the doc validates a per-product max).
- Whether her client number requires parcel weights (optional by default;
  if required, they get modeled like pricing: base weight + per-field
  additional weights in the canonical definition).
- Where the label PDF is stored (Vendure Asset vs private storage).
