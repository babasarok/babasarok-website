# Barion API — grounding document for ADR 0019

Last verified: 2026-11-15

Grounds the claims in [docs/adr/0019-barion-payment-integration.md](adr/0019-barion-payment-integration.md)
(sections "What we know about Barion" and "Barion-side choices", questions 9–14) against
Barion's official documentation at docs.barion.com.

**How this was verified.** docs.barion.com is behind a Cloudflare challenge and rejects
direct fetches, so every page below was read from the Wayback Machine's snapshot of the
page (snapshot date noted per section). Two pages — the BankTransfer deprecation line and
the idempotency-key page — exist only on the live wiki (no snapshot yet); their content
was confirmed from the page's own indexed text and is flagged accordingly. SDK/plugin
landscape was checked against npm and GitHub APIs directly.

- [1. Payment/Start](#1-paymentstart)
- [2. Authoritative state: PaymentState v4](#2-authoritative-state-paymentstate-v4)
- [3. Callback mechanism](#3-callback-mechanism)
- [4. HMAC-SHA512 signing](#4-hmac-sha512-signing)
- [5. PaymentType: Immediate / Reservation / DelayedCapture](#5-paymenttype-immediate--reservation--delayedcapture)
- [6. FundingSources](#6-fundingsources)
- [7. Currencies](#7-currencies)
- [8. Sandbox](#8-sandbox)
- [9. SDK landscape](#9-sdk-landscape)
- [10. Vendure plugin landscape](#10-vendure-plugin-landscape)
- [11. Onboarding](#11-onboarding)
- [12. Payer data and SCA/3DS](#12-payer-data-and-sca3ds)
- [13. Refund](#13-refund)
- [14. Things the ADR missed](#14-things-the-adr-missed)
- [Implications for ADR 0019](#implications-for-adr-0019)

## 1. Payment/Start

**ADR claims:** required fields POSKey, PaymentType, PaymentRequestId, FundingSources,
Currency, RedirectUrl, CallbackUrl, Transactions[] with Payee/Total/Items; GatewayUrl in
the response; idempotency key support.

**The doc says** ([Payment-Start-v2][start], snapshot 2026-01-22, page edited
2026-01-07):

- Required input properties: `POSKey`, `PaymentType` (accepted values `Immediate`,
  `Reservation`, `DelayedCapture`), `GuestCheckOut` (bool), `FundingSources`,
  `PaymentRequestId` (max 100 chars), `RedirectUrl` (max 2000 chars), `CallbackUrl`
  (max 2000 chars), `Transactions` ([PaymentTransaction][paytx] array, "must contain at
  least one"), `Currency` (3-char ISO 4217), `Locale` (max 10 chars, 11 accepted
  languages incl. `hu-HU`, `en-US`).
- The ADR's field list is correct but incomplete: **`GuestCheckOut` and `Locale` are
  also required** and would fail a minimal request.
- `RedirectUrl` is marked _Required_ but its description also says "If not provided, the
  system will use the redirect URL assigned to the shop" — an internal inconsistency in
  the doc; treat it as required-but-overridable.
- `PaymentTransaction` requires `POSTransactionId`, `Payee` ("must be the e-mail address
  of a valid Barion wallet"), `Total` (decimal, "must be greater than the minimum
  transaction amount in the given currency", currency-dependent decimal precision), and
  `Items` (required array).
- Output properties include `PaymentId`, `Status`, `QRUrl` (QR-code URL for the payment),
  `RecurrenceResult`, `Transactions`, `GatewayUrl` ("The URL of the Barion Smart Gateway
  (including the payment identifier), where the API caller should redirect the payer"),
  `CallbackUrl`, `RedirectUrl`, `ThreeDSAuthClientData`, `TraceId`. ✓
- Reservation-specific: `ReservationPeriod` (required iff `PaymentType` is
  `Reservation`, min one minute, **max one year**, default 30 minutes) and
  `DelayedCapturePeriod` (required iff `DelayedCapture`, min one minute, **max 7 days,
  21 days in case of a Hungarian shop**, default seven days).
- `PaymentWindow` (optional, min one minute, **max one week**, default 30 minutes) —
  the time the payer has to complete the payment before it expires.

**Idempotency.** A dedicated [Idempotency-Key][idem] page exists on the live wiki: "An
idempotency key lets you safely retry a request when you cannot tell whether the first
request reached Barion, for example after a timeout." The page has no Wayback snapshot
yet, so its exact mechanics (which endpoints accept the key, header vs body) could not
be captured here — treat the ADR's "idempotency keys are supported" as **verified to
exist on the live docs**, with details to re-check when the page is fetchable.

Sources: [Payment-Start-v2][start] · [PaymentTransaction][paytx] · [Idempotency-Key][idem] (live only)

## 2. Authoritative state: PaymentState v4

**ADR claims:** `GET /v4/Payment/{PaymentState}`; the v2 `GetPaymentState` is deprecated.

**The doc says** ([Payment-PaymentState-v4][state-v4], snapshot 2026-01-22; [List of API
endpoints][endpoints], snapshot 2026-02-12):

- The endpoint is **`GET /v4/payment/<PaymentId>/paymentstate`** — the placeholder is the
  payment's GUID, not the word "PaymentState". The ADR's `GET /v4/Payment//PaymentState`
  is the wrong path shape; fix it in the ADR.
- The v2 `/Payment/GetPaymentState` is listed on the endpoints page with an explicit
  "(deprecated)" marker. ✓
- The v4 page says it is "the preferred API endpoint for querying the state of a
  payment".
- **Authentication differs from v2:** v4 uses _header-based_ shop authentication
  (`x-pos-key` header), not a body/query `POSKey`.
- Output includes `Status`, `PaymentType`, `AllowedFundingSources`, `FundingSource`
  (`Balance`, `BankCard` or `BankTransfer`), `FundingInformation`, `GuestCheckout`,
  `CreatedAt`, `CompletedAt`, `ValidUntil`, `ReservedUntil` (reservations),
  `DelayedCaptureUntil` (delayed captures), `Transactions`
  ([DetailedPaymentTransaction][dtx] array), `Total` ("If a reservation was finished
  with a lower amount … this can be lower than at payment creation time"), `Currency`,
  `CallbackUrl`, `RedirectUrl`, `PaymentMethod`, and `FraudRiskScore` (0–100;
  transactions ≥ 30 "are blocked automatically").

Sources: [Payment-PaymentState-v4][state-v4] · [List of API endpoints][endpoints]

## 3. Callback mechanism

**ADR claims:** POST on every state change; the callback body is only a signal
(`paymentId`); respond HTTP 200 within 15 s; 5 retries; "polling instead of callbacks
can get the shop suspended."

**The doc says** ([Callback mechanism][callback], snapshot 2026-01-22, page edited
2025-12-12):

- "Whenever there's a change in the status of a payment transaction, the Barion server
  sends a HTTP POST request to the `CallbackUrl`" with the `PaymentId`. The notification
  "is merely an indication that there's an update to query." ✓
- "Your listener should acknowledge receipt of the POST request with a `HTTP 200 OK`
  response **within 15 seconds**." ✓ (the 15 s threshold is exact)
- "The Barion server re-sends the webhook **up to 5 more times** after the initial
  15-second window, with increasing delays between calls (2 seconds, 6 seconds,
  18 seconds, 54 seconds, and 102 seconds)." After the fifth failed call (~4 minutes
  total), Barion emails the shop's registered address. ✓
- The listener must then call PaymentState and branch on `PaymentStatus`; the callback
  itself carries no status. The [Responsive web payment][rwp] page states it plainly:
  "**The callback signal is only a signal that does not indicate the success of the
  payment!**" — a `GetPaymentState` request is mandatory.
- **The suspension warning exists but is on the Responsive-web-payment page, and it is
  about flooding, not polling per se:** "WARNING: Flooding the Barion servers with
  unnecessary API calls, instead of relying on the callback mechanism, **may lead to
  suspension of the shop**." ✓ (exact wording above). At the same time, the callback
  page _prescribes_ a fallback: poll PaymentState after the buyer is redirected back,
  and again ~15 minutes after the payment window expires if no final callback arrived.
  So the correct reading is: callbacks are the primary mechanism, occasional fallback
  polling is expected, hammering the state endpoint is not.
- **Rate limit (ADR missed):** calling PaymentState with the same `PaymentId` more than
  once within a 5-second interval returns `HTTP 429` for the following 5 seconds; higher
  volumes beyond "a certain threshold" also 429.
- Callbacks must be served over HTTPS with TLS 1.2+ ("callbacks do not yet support TLS
  1.3" — [Security Measures][security]).
- **IP allowlisting (ADR missed):** production callbacks come from `40.113.73.229`,
  sandbox from `20.223.214.216` (both [Callback mechanism][callback] and
  [Security Measures][security]; "The IP address of the callback request may change any
  time").
- **Payload shape:** the POST carries the `paymentId` (also appended to the callback URL
  as a query parameter, per Payment-Start-v2). The docs do not promise a richer body —
  design the endpoint around the id, then re-query.

Sources: [Callback mechanism][callback] · [Responsive web payment][rwp] · [Security Measures][security]

## 4. HMAC-SHA512 signing

**ADR claims:** optional HMAC-SHA512 signing of requests and of Barion's callback
messages (`x-timestamp`/`x-nonce`/`x-signature-sha512`).

**What the docs say:**

- **The cited source is wrong, the claim itself is right.** The [Security
  Measures][security] page (snapshot 2025-05-01, edited 2024-12-30) contains _no_
  signing content — only the callback IP list and TLS requirements. The signing
  mechanics are documented in the README of Barion's **official PHP library**
  ([barion/barion-web-php][php-readme], repo pushed 2026-11-09) and, per a search-index
  snippet of the live wiki, have meanwhile also been added to the live
  [Barion Shop Authentication][shopauth] page (newer than the archived 2024 copy).
- From the PHP library README, exact wording: "If your shop has an HMAC key in Barion,
  give it to the client. Every request is then signed with HMAC-SHA512 (in the
  `x-timestamp`, `x-nonce` and `x-signature-sha512` headers), and the signature of every
  signed response is checked."
- **Optional vs mandatory is nuanced — and this is load-bearing for ADR question 13:**
  "Barion ignores the signature until the key is activated, and once the key is active,
  it **rejects every unsigned request**. Its callbacks are only signed while the key is
  active." So adoption is opt-in; once activated it is mandatory in both directions, and
  the callback signature check must be switched on only _after_ activation (before that,
  callbacks arrive unsigned).
- The signature embeds the current time; server clocks must be accurate within
  **5 minutes** (`InvalidResponseSignature` / `InvalidResponseTimestamp` error codes
  otherwise). Key rotation: Barion signs responses with the new key immediately but
  still accepts old-key requests for **24 hours**.

Sources: [barion/barion-web-php README][php-readme] · [Barion Shop Authentication][shopauth] · [Security Measures][security]

## 5. PaymentType: Immediate / Reservation / DelayedCapture

**ADR claims:** Immediate vs Reservation vs DelayedCapture semantics; Capture 7 days
(21 for Hungarian shops); FinishReservation up to 365 days; partial FinishReservation
auto-refunds the difference; CancelAuthorization exists.

**The docs say** — all numbers check out:

- **Delayed capture** ([Payment-Start-v2][start], [Delayed Capture][dcp] — snapshot
  2026-01-22, edited 2025-06-25): the payer is _not_ charged at payment; the amount is
  blocked on the payer's card; the merchant captures (or cancels) within
  `DelayedCapturePeriod` — **max 7 days, 21 days for Hungarian shops**. ✓ Capture is a
  single shot: "The same payment cannot be captured more than once", and _all_
  transactions must be captured in one call. Capturing less than authorized simply
  releases the difference ("no refund transaction is generated"). Only bank-card
  funding works. If the issuer lifts the hold or the card dies before capture, **the
  capture fails and the merchant gets nothing** — "you should wait until the capture is
  successful before fulfilling the purchase".
- **Reservation** ([Reservation payment][rsv] — snapshot 2026-01-31; [Payment-Start-v2][start]):
  the payer _is_ charged immediately; the money is reserved in the Barion system — for
  card payments it is "transferred to the merchant, and stays reserved in the wallet
  _of the merchant_" (not held on the card). The window is `ReservationPeriod`, **up to
  365 days**. ✓
  - Finishing is per payment transaction with `0 ≤ Y ≤ X`; **partial finish releases Y
    to the merchant and auto-refunds the rest to the customer**; finish with 0 is a
    storno. ✓ Each transaction can be finished only once, but the
    [Delayed Capture comparison table][dcp] confirms FinishReservation "may be called
    multiple times for the same payment" (i.e. across transactions / steps).
  - If the timer elapses, unfinished transactions are auto-finished at zero and
    refunded; the payment becomes `Expired` or `PartiallySucceeded`.
  - **Risk the ADR missed:** if the payer's card is expired/blocked by finish time, the
    refund **fails** and "the merchant receives the full prepared amount — in this
    case, it is the merchant's full responsibility to arrange the return of the
    remaining amount to the customer". Over a 365-day window this is a real scenario.
    Also: "bank card refunds can take up to 30 days depending on the bank system".
  - **Fee mechanics the ADR missed:** reservation fees are deducted up-front — the
    merchant's wallet must cover the fee amount at `Payment/Start` time ("the Barion
    system reserves the fee amount in the merchant's wallet"), else Start fails
    (`DoNotHaveEnoughMoneyToPreparePayment` on the reservation page;
    `FacilitatorDoesntHaveEnoughMoney` on the responsive-payment page, where the former
    is marked "not sent anymore" — the two pages disagree; the wallet-must-cover-fees
    rule is stated on both).
  - **Modifiable amounts:** Payment-Start-v2's PaymentType description says
    "Reservation amounts can be modified during this time window unless the new amount
    is lower than the original" — the wording is ambiguous (it reads backwards);
    quote it verbatim when relying on it.
- **CancelAuthorization exists** ([Payment-CancelAuthorization-v2][cancel]): "All
  transactions are reversed, and the payment is finished with 0 amount. The blocking of
  the amount on the payment card is lifted." ✓ (documented as the lightweight
  alternative to capturing with 0, for delayed capture).
- **Buyer visibility (directly answers part of question 10):** both the
  [Reservation payment][rsv] and [Delayed Capture][dcp] pages state: "the Barion Smart
  Gateway user interface is identical in all payment scenarios. The customer might not
  be (as they are not needed to be) aware that there is a reservation taking place in
  the background!" The buyer sees the same gateway whether the payment is Immediate,
  Reservation or DelayedCapture.

Sources: [Payment-Start-v2][start] · [Reservation payment][rsv] · [Delayed Capture][dcp] · [Payment-Capture-v2][capture] · [Payment-CancelAuthorization-v2][cancel]

## 6. FundingSources

**ADR claims:** per-payment flags; Balance cannot be disabled; BankCard guest or Barion
user; GooglePay/ApplePay guest-only and gated by the merchant contract; BankTransfer
"no longer supported" as of 2026-01-09 with a replacement being sought.

**The docs say** ([FundingSources][funding] — snapshot 2024-11-10, page edited
2022-03-18; [Bank Transfer Payment][btp]):

- "There is no option to disallow payment by balance since that would deny Barion Wallet
  users with a balance the ability to pay. There is an option to exclude cards, but not
  balance." ✓ (`All` is equivalent to `["Balance", "Card", "GooglePay", "ApplePay"]` —
  note BankTransfer is _not_ part of `All`.)
- `BankCard`: "either as a guest or as a logged-in Barion user" ✓.
- `GooglePay` / `ApplePay`: "Only available as guest on capable devices" ✓; and the
  contract gate is explicit: "Available payment methods may be limited by Barion
  operators for your shop, so for eg. if your contract does not allow Google Pay, it
  won't be displayed on Barion Smart Gateway, no matter what you send in this
  property." ✓
- **BankTransfer deprecation — verified.** The live [Bank Transfer Payment][btp] page
  carries: "As of today (2026.01.09.) this method is no longer supported. We are working
  hard to find an alternative solution." The claim, the date, and the
  replacement-being-sought status all hold **as of 2026-11-15** (the replacement is
  still only "being worked on"). The archived copy of that page (2024-09-10) predates
  the deprecation, and the archived FundingSources page still lists `BankTransfer` —
  the deprecation note lives on the Bank Transfer Payment page, not on FundingSources.
  Bank-transfer payments were CZK/EUR-only and immediate-only when they existed, which
  matches the ADR's decision to keep the bank-transfer branch outside Barion.

Sources: [FundingSources][funding] · [Bank Transfer Payment][btp] (deprecation line verified on the live page)

## 7. Currencies

**ADR claims:** HUF, EUR, CZK, USD, RON, PLN; one currency per payment; the merchant
wallet must hold an account in that currency; HUF minimum 10 Ft and zero decimals;
other currencies' minimums.

**The docs say:**

- The six-currency list is confirmed on [Payment-Start-v2][start] (snapshot 2026-01-22):
  `Currency` accepts "CZK", "EUR", "HUF", "USD", "RON", "PLN" — and "it is not possible
  to define multiple transactions in different currencies" ✓ (one currency per payment).
  Corroborated by Barion's Google Play listing (Oct 2026): "HUF, EUR, USD, CZK, PLN and
  RON". **However**, the [Supported currencies][currencies] page (snapshot 2024-09-10)
  still lists only HUF, EUR, CZK, USD — it has not been updated for RON/PLN in any
  snapshot; and neither the currencies page nor PaymentTransaction's precision list
  (CZK/EUR/USD 2 digits, HUF 0 digits) covers RON/PLN precision or minimums.
  **UNVERIFIED: RON/PLN minimum amounts and decimal precision.**
- Wallet requirement ✓, twice: "The Barion Wallet associated with your Barion shop needs
  to have a balance in the currency used" ([Supported currencies][currencies]); "To be
  able to receive payments in the selected currency the shop has to have an account
  created in that currency in the wallet" ([Responsive web payment][rwp]); and the
  canonical error in [Calling the API][calling]: `NotExistingCurrency` — "The POS
  doesn't have an account that supports EUR!"
- Minimums ✓ ([Supported currencies][currencies], [Responsive web payment][rwp]):
  card payments — HUF 10 Ft, EUR 0.1 €, USD $0.1, CZK 1 Kč; the (now-deprecated)
  bank-transfer/OpenBanking minimums were EUR 1 €, CZK 10 Kč. The minimum "doesn't apply
  when completing the payment using a Barion Wallet balance."
- HUF zero decimals ✓: "for HUF payments no decimal digits allowed while for EUR
  payments two decimal digits can be used" ([Responsive web payment][rwp]); same
  per-currency precision on [PaymentTransaction][paytx] ("HUF: zero digits"). Matches
  `ForintMoneyStrategy`.

Sources: [Supported currencies][currencies] · [Payment-Start-v2][start] · [Responsive web payment][rwp] · [PaymentTransaction][paytx] · [Calling the API][calling]

## 8. Sandbox

**ADR claims:** `api.test.barion.com` / `secure.test.barion.com`; completely separate
environment; self-serve shop creation with automatic sandbox approval (vs human approval
live); card simulator behavior; recurring/token enabled by default in sandbox.

**The doc says** ([Sandbox][sandbox] — snapshot 2025-05-01, page edited 2024-08-05):

- URLs ✓: "the URL has 'test' added: `secure.test.barion.com`, `api.test.barion.com`".
  Standard HTTPS cert instead of EV.
- Separateness ✓: "you can't port the Barion Wallet you've created in the Barion Sandbox
  to the production environment – you explicitly need to create a new Barion Wallet in
  production." Nominal funds only; no outgoing bank transfers; "no KYC procedures are in
  place" and no limits on sandbox wallets.
- **Self-serve approval ✓:** "Barion shops are approved automatically – you don't have
  to go through onboarding when setting up a test Barion shop" — contrasted directly
  with the live [Going live][going] flow.
- **Card simulator ✓:** "All test cards accept any future date as expiration date, and
  any 3-digit number as CVC code." Each `ProcessResult` value has a dedicated card:
  Successful `4444 8888 8888 5559`, ProblemWithCard `…4446`, LowFunds `…9999`,
  LostOrStolenCard `…1111`, Declined `…3331`, FraudulentTransaction `…6664`,
  CardSystemError `…7779`, ScaSoftDeclined `…0006`. ([Making a test payment][testpay]
  walks through the full flow with the Successful card and the
  `api.test.barion.com/v2/payment/start` → `GatewayUrl` response.)
- **Tokens by default ✓:** "token payment scenarios are enabled by default."
- Extra facts the ADR missed: **3DS is not performed with test cards**; the sandbox
  gateway shows a warning ribbon; sandbox callbacks come from a different IP; the mobile
  app connects to sandbox with a `test#` prefix on the Barion ID; sandbox tokens do not
  work in production.

Sources: [Sandbox][sandbox] · [Making a test payment][testpay]

## 9. SDK landscape

**ADR claims:** no official Node SDK (official = PHP + mobile); community `node-barion`
(npm, MIT, v4.0.0, 2026).

**Verified against primary sources:**

- The official GitHub org `barion` contains: **barion-web-php** (PHP library, active —
  pushed 2026-11-09), **barion-android** / **barion-ios** (mobile), and app2app example
  libraries for Android/iOS/Swift. **No official Node/TypeScript library exists.** ✓
- **node-barion** on npm: version **4.0.0**, license **MIT**, latest publish
  **2026-01-13**, repo `aron123/node-barion`, description "Node API library for Barion
  Smart Gateway electronic payment system". ✓ (the ADR's "v4.0.0, 2026" holds; it is a
  community package, not official.)
- The docs' own Libraries page could not be verified: no Wayback snapshot of any
  "Libraries" page on docs.barion.com exists, so the _documented_ official-library list
  is unverified — the org listing above is the evidence.

Sources: npm registry (`node-barion`) · GitHub API (`orgs/barion/repos`)

## 10. Vendure plugin landscape

**ADR claims:** no Vendure Barion plugin exists; the integration is a custom
`PaymentMethodHandler` + callback controller.

**Verified:** GitHub repository search for `vendure barion` returns **0 results**; the
vendure.io plugin catalog (fetched 2026-11-15) contains no Barion plugin (payment
plugins listed include hulo-payments and others; no Barion). ✓

Sources: GitHub search API · https://www.vendure.io/plugins/

## 11. Onboarding

**ADR claims:** online registration is the contract; live shop needs human KYC/company
approval (AML); business wallets start with reduced limits; fees are package-based and
deducted from the merchant balance; recurring/token payments need separate advance
approval ("trustworthy companies"); payer ≠ payee.

**The docs say** ([Going live][going] — snapshot 2024-08-14; [Creating an
account][account] — snapshot 2024-09-10; [Token payment][token] — snapshot 2026-02-07;
[Reservation payment][rsv]; [Responsive web payment][rwp]; [Payment-Refund-v2][refund]):

- "Contracting is done by accepting the Terms & Conditions in online registration, there
  is no paperwork or similar hassle." ✓
- "We are mandated to check each shop and **approve it manually**… Upon approval, you are
  asked to provide additional information (such as company papers)… Upon reaching certain
  limits, or by the decision of our staff, you are asked to go through a process called
  KYC … mandated by Anti Money Laundering (AML) laws." ✓ (nuance: manual shop approval
  is universal; full KYC kicks in at limits or staff decision.)
- **Reduced limits ✓:** a freshly registered account "is in an unverified status. This
  means there are several limits applied to your account… To disable these limits, you
  must undergo our KYC procedure" ([Creating an account][account]). (The ADR's "the
  gateway keeps working either way" is not stated on this page — plausible but
  UNVERIFIED.)
- **Fees ✓:** "The Barion system deducts fees from the merchant after each payment"
  ([Reservation payment][rsv]); fee transactions appear in the `Payment/Start` response's
  `Transactions` array ([Responsive web payment][rwp]). "Package"-based pricing is a
  barion.com (marketing site) concept, not documented on docs.barion.com — Going live
  only says "Make sure you fulfill all requirements of your chosen price package."
- **Token/recurring approval ✓, exact wording:** "Token or recurring payments must be
  further approved. Since token payment basically allows you to carry out payments at
  will, this option is **only available for trustworthy companies**. Contact our experts
  well in advance" ([Going live][going]); and [Token payment][token]: "This scenario is
  not allowed automatically for every approved shop and should be requested from
  Barion!" with the `RecurringPaymentNotAllowed` error pointing to the same rule. ✓
- **Payer ≠ payee ✓:** "Do not try to pay with the account that owns the shop! It is not
  permitted to purchase in your own shop!" ([Responsive web payment][rwp]); enforced
  again at the API level — the Refund endpoint returns
  `TheSourceAndDestinationAccountsAreMatched` "in case the payment was payed by the shop
  owner". Also note: if a transaction's `Payee` is a _different_ wallet than the shop's,
  the payment "automatically will be upgraded to sharing economy scenario" — the Payee
  must belong to the shop's own wallet for a normal scenario.
- Going-live extras the ADR missed (relevant to question 14): the shop's own T&C must
  include Barion payment ("Our staff checks it and only approves shops with properly
  formulated legal texts"); official logo placement is required; a cutover checklist
  (API URL, gateway URL, live POSKey, redirect/callback URLs, Payee e-mails, sandbox
  tokens don't carry over).

Sources: [Going live][going] · [Creating an account][account] · [Token payment][token] · [Reservation payment][rsv] · [Responsive web payment][rwp] · [Payment-Refund-v2][refund]

## 12. Payer data and SCA/3DS

**ADR claims:** `Payment/Start` accepts 3DS-related payer data (name, e-mail, phone,
shipping address); sending it raises SCA pass rates.

**The doc says** ([Payment-Start-v2][start]): properties marked **3DS** "must be provided
to comply with 3D Secure authentication. **The more attributes you provide the more
chance you have to avoid the challenge flow.**" And: "if the merchant does not provide
3DS-related properties, it doesn't mean that the payment will fail. It means that the
payer will have a higher chance of getting a challenge during payment." ✓

The marked properties: `PayerHint` (e-mail), `CardHolderNameHint` (2–45 chars),
`RecurrenceType` + `TraceId` (token payments), `ShippingAddress`, `PayerPhoneNumber` /
`PayerWorkPhoneNumber` / `PayerHomeNumber` (format `36701231234`, no `+`/leading zeros),
`BillingAddress`, `PayerAccountInformation`, `PurchaseInformation`,
`ChallengePreference`. All of these are "Required for 3DS" and "optional, but
recommended" in practice — checkout already collects name, e-mail, phone and addresses
(epic 6), so feeding them to Barion is mostly a mapping task.

Sources: [Payment-Start-v2][start]

## 13. Refund

**ADR claims:** `POST /v2/Payment/Refund` on `Succeeded` payments, full or partial per
transaction.

**The doc says** ([Payment-Refund-v2][refund] — snapshot 2024-12-04): input `POSKey`,
`PaymentId`, `TransactionsToRefund` ([TransactionToRefund][ttr] array, required). Error
table confirms the semantics:

- `PaymentStatusNotValid` — "Only payments in `Succeeded` status can be refunded." ✓
- `AmountToRefundIsGreaterThanTransactionAmount` — partial per-transaction refunds are
  the model; the request carries an amount per transaction. ✓
- Only `CardPayment`, `Shop` and `BankTransferPayment` transaction types are refundable
  (`InvalidTransactionType`); the shop's wallet must hold enough balance
  (`TooLowBalanceToMakeRefund`); a suspended shop cannot refund
  (`SuspendedUserTriedToRefund`).
- From [Callback mechanism][callback]: "the status of these payments won't change
  regardless of whether the refund was successful or not" — refunds add refund-type
  transactions but the payment stays `Succeeded`.

Sources: [Payment-Refund-v2][refund] · [Callback mechanism][callback]

## 14. Things the ADR missed

Matters for the open questions or the implementation:

1. **`GuestCheckOut` and `Locale` are required on `Payment/Start`** — a minimal request
   the ADR sketches would be rejected. `Locale` decides the gateway language
   (`hu-HU` available).
2. **`PaymentWindow`** (optional, default 30 minutes, max one week) — how long the buyer
   may sit on the gateway; expired payments become `Expired` and (for reservations) are
   auto-refunded. Relevant to question 15's "payment is `Started`" UX.
3. **The gateway shows what we send, and nothing else** (question 10): the payer sees
   the transaction's `Items` ("These are shown to the payer on the Barion Smart
   Gateway") and the `Total`; the transaction `Comment` is explicitly "**NOT shown to
   the payer**", as are `PayeeTransactions`. So a deposit payment displays exactly the
   items/description we attach to the 6 000 Ft transaction — there is no
   order-total-elsewhere view; whatever we want the buyer to see must be put into
   `Items`/`Name`/`Description`.
4. **Gateway UI is identical across PaymentTypes** — a Reservation payment is
   indistinguishable from an Immediate one to the buyer ([Reservation payment][rsv]).
5. **No iframes:** "Make sure that the user is redirected properly **no iframe hacks are
   allowed**" — full-page redirect only. And **no financial decision may be made on the
   returning customer** — only PaymentState counts.
6. **Fallback polling is prescribed, not just tolerated:** after redirect, and ~15
   minutes after window expiry, poll PaymentState if no callback arrived.
7. **PaymentState rate limit:** same `PaymentId` more than once per 5 s → `HTTP 429`.
   Matters for any "poll the gateway" retry loop and for question 13's callback design.
8. **Callback IP allowlist + TLS floor:** prod `40.113.73.229`, sandbox
   `20.223.214.216`; TLS 1.2+ required, and **callbacks do not support TLS 1.3 yet**.
   Directly relevant to question 13 (the deployed endpoint must accept TLS 1.2 from
   those IPs).
9. **HMAC signing semantics** (question 13): opt-in until activated, then _mandatory_
   in both directions; 5-minute clock tolerance; 24-hour rotation overlap. The ADR's
   "HMAC (yes/no)" question needs this activation-ordering detail (set key → activate →
   enable callback check).
10. **Reservation fee pre-reservation:** the merchant wallet must cover Barion's fees
    _at Start time_ for a Reservation payment, even if the finish amount will be lower.
    A 6 000 Ft-deposit-only or reservation-based flow needs wallet balance up front.
11. **Card-death risk on long reservations:** if the payer's card is expired/blocked at
    finish time, the refund of the un-finished difference fails, the merchant receives
    the _full_ prepared amount, and repaying the buyer becomes the merchant's manual
    job. Grows with the reservation window (365 days allowed).
12. **Refund payments stay `Succeeded`** — refund results live in new refund-type
    transactions, not in the payment status. Matters for question 12's state mapping.
13. **`FraudRiskScore` on PaymentState** (0–100; ≥ 30 auto-blocked) — free signal worth
    logging from day one.
14. **Test card matrix** per `ProcessResult` (see §8) — the sandbox gives deterministic
    success/decline/fraud/SCA-soft-decline paths for the E2E suite.
15. **Sandbox ≠ live artifacts:** sandbox tokens don't work in production; POSKeys are
    per-environment and "cannot be changed later"; the live shop needs its own
    redirect/callback URLs.
16. **Sharing-economy trap:** a `Payee` that isn't the shop's own wallet silently
    upgrades the payment to a "sharing economy scenario" — keep the Payee = shop wallet
    invariant in the handler.

## Implications for ADR 0019

**Question 11 (Reservation for the full total) — the idea survives grounding, with two
new caveats and one strengthening fact:**

- **Strengthening:** the numbers the ADR leans on are all real — `ReservationPeriod`
  max is literally "one year", partial `FinishReservation` auto-refunds the difference,
  and `DelayedCapture`'s 7/21-day window is confirmed too short for made-to-order lead
  times. FinishReservation can be called multiple times per payment (per transaction
  once), so a two-step finish (deposit at placement, remainder on delivery) fits the
  API shape. The COD remainder could genuinely be electronic: the buyer's money is
  already in the merchant's (reserved) wallet the moment the reservation is set up.
- **Caveat 1 — the money model is the opposite of what "authorize on card" suggests.**
  A Barion Reservation _charges the payer immediately_; for card payments the money
  moves to the merchant's wallet and sits reserved _there_. The buyer is charged the
  full total at placement — full stop. The ADR already says "at the cost of authorizing
  the full amount on the buyer's card at placement", but the doc makes it stronger:
  it's a completed charge that Barion holds, not a card authorization hold. What the
  buyer sees on her statement and when she can dispute it are buyer-side questions the
  docs don't answer.
- **Caveat 2 — card-death at finish time.** With a months-long window, an
  expired/blocked card at `FinishReservation` time is a realistic case; Barion's answer
  is that the merchant receives the full amount and owes the buyer a manual refund.
  The deposit-branch state machine (question 1) would need a story for "reservation
  finished, refund failed".
- **Caveat 3 — fees must be pre-funded.** Every reservation requires the merchant
  wallet to hold the fee amount at Start; the owner needs wallet balance before the
  first reservation payment of any size.
- **Delayed capture is ruled out for the deposit branch** — 7/21 days, card-only,
  single capture. The ADR's instinct to prefer Reservation over DelayedCapture for long
  lead times is confirmed by the docs.

**Question 10 (what the deposit payment shows on the gateway) — the doc answers the
factual half directly:** the gateway shows the payment we started, nothing more — the
`Total` plus the `Items` we attach (names, descriptions, quantities, unit prices).
`Comment` is not shown to the payer, and there is no "full order with a partial
transaction" mode: if we start a 6 000 Ft payment, the buyer sees a 6 000 Ft payment
whose item list is whatever we choose to render (e.g. one line "Előleg — <product>").
If we want the buyer to see the full order context, we must put it into the `Items`
array ourselves; the gateway adds nothing. Remaining for the ADR: only the _product
decision_ of what the Items should say.

**Question 13 (callback endpoint) — three concrete inputs:** the 15-second ACK budget
is real and exact (5 retries then an email, ~4 minutes total); TLS 1.2 works but TLS
1.3 does **not** for callbacks yet; and HMAC adoption is a three-step activation
(set key → Barion activates → enable callback verification) whose activation makes
signing mandatory — the "yes/no" decision should assume eventual activation or none.

**Question 14 (onboarding timing):** manual approval is guaranteed for every live shop,
full KYC is triggered "upon reaching certain limits, or by the decision of our staff" —
so approval latency is unavoidable but KYC depth is initially limit-gated. The owner's
pre-work list should include: T&C text with Barion payment included, logo placement,
price-package choice, and — if token payments are ever wanted — contacting Barion "well
in advance".

**Corrections the ADR should absorb when it moves from draft to proposal:** the
PaymentState path is `GET /v4/payment/{paymentId}/paymentstate`; `GuestCheckOut` and
`Locale` are required Start fields; the HMAC source is the PHP library / Shop
Authentication, not Security Measures; RON/PLN minimums and precision are undocumented
(verify with Barion before multi-market work, epic 9); and the suspension warning is
about flooding, with fallback polling explicitly prescribed.

<!-- reference links -->

[start]: https://docs.barion.com/Payment-Start-v2
[paytx]: https://docs.barion.com/PaymentTransaction
[idem]: https://docs.barion.com/Idempotency-Key
[state-v4]: https://docs.barion.com/Payment-PaymentState-v4
[endpoints]: https://docs.barion.com/List_of_API_endpoints
[dtx]: https://docs.barion.com/DetailedPaymentTransaction
[callback]: https://docs.barion.com/Callback_mechanism
[rwp]: https://docs.barion.com/Responsive_web_payment
[security]: https://docs.barion.com/Security_Measures
[php-readme]: https://github.com/barion/barion-web-php/blob/master/readme.md
[shopauth]: https://docs.barion.com/Barion_Shop_Authentication
[dcp]: https://docs.barion.com/Delayed_Capture
[rsv]: https://docs.barion.com/Reservation_payment
[capture]: https://docs.barion.com/Payment-Capture-v2
[cancel]: https://docs.barion.com/Payment-CancelAuthorization-v2
[funding]: https://docs.barion.com/FundingSources
[btp]: https://docs.barion.com/Bank_Transfer_Payment
[currencies]: https://docs.barion.com/Supported_currencies
[calling]: https://docs.barion.com/Calling_the_API
[sandbox]: https://docs.barion.com/Sandbox
[testpay]: https://docs.barion.com/Making_a_test_payment
[going]: https://docs.barion.com/Going_live
[account]: https://docs.barion.com/Creating_an_account
[token]: https://docs.barion.com/Token_payment
[refund]: https://docs.barion.com/Payment-Refund-v2
[ttr]: https://docs.barion.com/TransactionToRefund
