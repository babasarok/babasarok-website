# ADR 0013 — Checkout on the native Vendure order flow

Status: accepted

Refines [ADR 0012](0012-site-reads-vendure-at-request-time.md) decision 5
(the basket is the Vendure active order) into the concrete backend contract
that roadmap slice S5a delivers.

## Context

Today the site prices the basket in the browser and posts one
`submitQuoteOrder` payload (contact, delivery method and its price, a client
total, per-product `details`); the backend stores it as-is on placeholder
variants (ADR 0001). The cutover replaces that with Vendure's own order
flow, and the later epics must extend the result instead of rebuilding it:
native delivery (6), Barion payment and NAV invoicing (7), English (8),
Slovakia/EUR (9).

## Decision

1. **The basket is the Vendure active order, for guests.** The site API is
   cross-origin, so the session is the bearer token Vendure already issues
   (`tokenMethod` includes `bearer`); no account is required. Lines are added
   with the stock `addItemToOrder` carrying the `selections` / `lengthCm`
   custom fields, edited with `adjustOrderLine` / `removeOrderLine`. Prices
   come from the server pricing strategy; every amount is read from the order
   with its `currencyCode`, nothing in the API is Forint-specific. Old
   client-side baskets are dropped at cutover (no migration). The checkout's
   contact details are saved onto the active order as the buyer types and
   pre-filled from it, never kept in the browser; ÁSZF acceptance is never kept.
2. **Delivery methods are native `ShippingMethod`s.** The first version keeps
   today's three combined payment+delivery options exactly (GLS előre
   utalással 2 500, GLS utánvéttel 3 500 with the deposit note, Személyes
   átvétel Telkibányán 0), using the stock flat-rate calculator with a
   gross rate. Names are translations (`hu`; plain text — the old `__…__`
   emphasis markup is not stored). "Needs an address" is the `ShippingMethod`
   custom field `requiresAddress` (public, so `eligibleShippingMethods`
   returns it in each quote's `customFields`). Seeded at bootstrap by
   `ChannelSetupPlugin`, create-if-missing by `code` (the promotion: by name; deleted rows count as existing) and never
   overwritten, so the owner edits prices and names in the stock dashboard; a
   Postgres advisory lock keeps the server and worker from seeding twice. A
   migration was rejected: shipping methods carry translations and calculator
   argument JSON across several tables, which generated SQL would hard-wire.
3. **Free delivery is a native `Promotion`.** `minimum_order_amount`
   (tax-inclusive, 60 000) with the `free_shipping` action, seeded the same
   way and editable in the dashboard. The threshold is judged on the
   subtotal after line and set discounts (`>=`; the old rule was strict `>`).
   The threshold amount is data on the promotion, so a second market adds its
   own promotion in its own channel/currency.
   The set discount's per-instance breakdown and per-line set state are shop-API
   fields (`Order.setDiscounts`, `OrderLine.setState`) read from the same
   allocation the set promotion applies (`SetBasketService`).
4. **Contact, address and the rest use native fields where they exist.**
   Contact is `setCustomerForOrder` (guest; the phone is its
   `phoneNumber`). The address stays free text for this version: it is
   `setOrderShippingAddress` with `streetLine1` holding the text and
   `countryCode` — the same place the legacy path already writes — so
   structured addresses (epic 6) fill the other native address columns
   without a data move. A separate billing address (epic 7, invoicing)
   is the order's native billing address, set with `setOrderBillingAddress`
   from the same structured form; no billing data is collected before then. `message`, `termsAccepted` and
   `taxNumber` are the Order custom fields set through
   `setOrderCustomFields` (never named `transactionId`: it collides with the
   native payment-derived field).
5. **Placing the order is one native sequence** ending in
   `transitionOrderToState(ArrangingPayment)`; `QuoteOrderPlacedStrategy`
   stays until payments (epic 7 replaces it: payment moves the order to
   `PaymentAuthorized`/`PaymentSettled` and the placed state moves there). A
   `CheckoutReadinessProcess` order process refuses the transition with a
   Hungarian message unless the order has lines, a customer, a shipping
   method, the accepted terms and — when the method `requiresAddress` — an
   address. Orders still created by the legacy mutation are exempt (they carry
   `deliveryMethodName`).
6. **Stale lines are machine-readable.** The shop API extends `OrderLine`
   with `invalidReason { code message }` (codes `NOT_ORDERABLE`,
   `VARIANT_UNAVAILABLE`, `OPTION_NOT_OFFERED`; null when the line is fine),
   decided by the one shared line-validity check also used by the transition
   guard, which refuses `ArrangingPayment` while any line has a reason. A
   line's `unitPriceWithTax` is its stored price: the site compares it with
   the price its (cached) page showed and surfaces the difference. Vendure
   re-prices a line only when it is added or adjusted, so a price edit does
   not silently change a basket that already holds the line.
7. **Emails are built from the order.** The line titles and per-product
   details come from each line's `selections` plus the canonical definition,
   material and thread-colour labels; the delivery row comes from the order's
   shipping line (method, price, or "ingyenes" when a promotion zeroed a
   charged price) and the total from the order. The legacy path keeps its
   stored `details`/custom-field values until it is removed. Subjects are
   unchanged.
8. **`submitQuoteOrder` is retired in the cleanup after the cutover.** S5a
   lands in `feat/site-cutover`, which deploys site and backend together, so
   it could change the old checkout; the mutation and its emails nevertheless
   keep working unchanged as cheap insurance for the deploy-skew window: the legacy mutation, its
   `details`/`configText` handling, the legacy-only Order/OrderLine custom
   fields (`deliveryMethodName`, `deliveryPrice`, `deliveryFree`,
   `orderTotal`, `setDiscountSummary`; `title`, `configText`, `detailsJson`,
   `quotedUnitPrice`, `quotedLineTotal`), the placeholder variants and the
   email view's legacy branch are removed together in the cutover follow-up.

## Why this is roadmap-proof

- **Epic 6 (native delivery):** the shipping methods and the promotion
  already exist; epic 6 splits the combined options into payment (epic 7)
  and delivery methods, makes the address structured and swaps carrier
  calculators — all edits to the same `ShippingMethod` rows and the same
  checkout mutations.
- **Epic 7 (Barion, NAV):** the order is a real order with native totals,
  tax lines and a shipping line, which is what payment and invoicing consume;
  only the placed strategy and the transition target change.
- **Epic 8 (English):** every buyer-facing text on the order is a
  translation or comes from the request language; names are translatable
  entities.
- **Epic 9 (Slovakia/EUR):** nothing hardcodes the currency, delivery and
  free-shipping thresholds are per-channel data, and the address country is
  an input.

## Considered and rejected

- **Keeping a client-quoted total in the payload.** It makes the client the
  price authority again (ADR 0002 reversed) and cannot work with payments.
- **A custom `submitOrder` mutation wrapping the sequence.** Hides the native
  state the site needs (eligible shipping methods, order errors) behind a
  bespoke result type; the stock mutations already carry everything.
- **Storing the free-delivery threshold as a shipping-method field.** A
  promotion is Vendure's own mechanism, reads the discounted subtotal and
  shows in the dashboard's promotion list.

## Consequences

- A new buyer-facing contract: the site calls the native mutations in the
  order listed in the order-submission spec and renders `invalidReason`.
- The seed looks methods and the promotion up by code including deleted rows,
  so an owner's deletion is never undone at the next boot.
- Between backend and site deploys both paths work; the legacy path is
  throwaway.
