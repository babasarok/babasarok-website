# Order submission

Lets buyers place an order request for configured products: the checkout page
collects contact and delivery details for the basket (the Vendure active
order, see the order-basket spec) and places the order through the shop API's
native order mutations ([ADR 0013](../adr/0013-checkout-on-the-native-vendure-order-flow.md)).
The backend stores it as a Vendure order and emails the buyer and the shop
owner.

## Requirements

### Order form

The system SHALL provide the order form on a dedicated checkout page
(`/checkout`), where a buyer can manage the basket lines (quantity, removal),
see active set deals, choose a delivery method, and provide name, email,
phone, delivery address, and an optional message. The contact page SHALL NOT
host the order form; it keeps the contact information and links to the
checkout page. Every amount on the form is read from the Vendure order.

- **Scenario: Delivery method selection**
  - WHEN a buyer opens the checkout
  - THEN the offered delivery methods are the order's `eligibleShippingMethods`
    with their prices, and an address field is required when the selected
    method's `customFields.requiresAddress` is true
- **Scenario: Contact page without form**
  - WHEN a visitor opens the contact page
  - THEN they see the contact information and a link to the checkout page,
    but no order form

### Delivery methods

The system SHALL offer delivery as native Vendure shipping methods, seeded at
backend start if missing (looked up by code, deleted rows included, never
overwritten):

| Code               | Name (hu)                                         | Price (Ft, gross) | `requiresAddress` |
| ------------------ | ------------------------------------------------- | ----------------- | ----------------- |
| `gls-elore-utalas` | GLS házhozszállítás előre utalással               | 2 500             | true              |
| `gls-utanvet`      | GLS házhozszállítás utánvéttel (előleg szükséges) | 3 500             | true              |
| `szemelyes`        | Személyes átvétel Telkibányán                     | 0                 | false             |

The system SHALL seed a promotion that gives free shipping when the order's
subtotal with tax, after line and set discounts, is at least 60 000. The
delivery of an order qualifying for it is charged at 0 and its shipping line
keeps the method's price as the list price.

- **Scenario: Free delivery above a threshold**
  - WHEN the basket's discounted subtotal with tax reaches 60 000 and a
    charged delivery method is selected
  - THEN the order's shipping total is 0 and the order total equals the
    discounted subtotal
- **Scenario: Below the threshold**
  - WHEN the discounted subtotal is under 60 000
  - THEN the method is charged at its own price

### Order validation

The system SHALL refuse the transition `AddingItems → ArrangingPayment` of an
order with a Hungarian message unless: it has at least one line, none of which
has an `invalidReason`; it has a customer (`setCustomerForOrder`); a shipping
method is selected; the `termsAccepted` custom field is true (given for every
order, never persisted across visits); and, when the selected method
`requiresAddress`, the shipping address `streetLine1` is non-empty. Orders
created by the legacy mutation are exempt (they carry `deliveryMethodName`).
Line validation on add/adjust is the order-basket spec's shop-API line
validation.

- **Scenario: Incomplete order**
  - WHEN the buyer tries to place an order missing contact, delivery method,
    required address or terms acceptance
  - THEN the transition is refused with a message naming what is missing
- **Scenario: Invalid line**
  - WHEN a line has an `invalidReason`
  - THEN placing the order is refused until the line is adjusted or removed

### Checkout details follow the active order

While a basket is in progress the checkout SHALL save what the buyer types
onto the active order through the same native mutations the submission uses
(`setCustomerForOrder` only when name and email are valid,
`setOrderShippingAddress`, `setOrderCustomFields` with `message` only,
`setOrderShippingMethod` on selection), on blur and after a short pause in
typing, and SHALL pre-fill name, email, phone, address, message and the
delivery method from the active order on load. A failed save SHALL NOT block
typing or submitting; submission still sends every field. Contact details are
never stored in the browser, and the ÁSZF acceptance is never saved or
pre-filled. A new basket after a placed order starts empty.

- **Scenario: Returning to an unfinished basket**
  - WHEN a buyer fills in the details, then reloads, opens another tab or
    returns on a later visit
  - THEN name, email, phone, address, message and delivery method are
    pre-filled from the active order and the ÁSZF box is unchecked
- **Scenario: Next basket after an order**
  - WHEN the buyer places an order and starts a new basket
  - THEN the checkout form is empty
- **Scenario: Save refused**
  - WHEN the server refuses a save (e.g. the email belongs to a registered account)
  - THEN typing and submitting continue unaffected

### Order submission

The system SHALL place the order with these native shop-API mutations, in
this order, each result checked before the next:

1. `addItemToOrder` / `adjustOrderLine` / `removeOrderLine` while building
   the basket (the basket spec);
2. `setCustomerForOrder` — email, first/last name (surname first), `phoneNumber`;
3. `setOrderShippingAddress` — free-text address in `streetLine1`, the shop's
   `countryCode`; required only when the method `requiresAddress`;
4. `setOrderShippingMethod` — one of `eligibleShippingMethods`;
5. `setOrderCustomFields` — `message`, `termsAccepted` and
   `submissionTransactionId` (a unique identifier generated per submission
   attempt; named so to avoid the native, payment-derived `transactionId`);
6. `transitionOrderToState("ArrangingPayment")` — the order is placed (there
   is no payment step yet).

Prices, set discounts, delivery and the total are the order's own
(price authority: the server pricing strategy and promotions, ADR 0002).

On the AddingItems → ArrangingPayment transition the backend SHALL email the
buyer a confirmation (subject: `Köszönjük a rendelésed: <rendelésszám>`) and
the shop owner a notification (subject: `Új árajánlatkérés: <rendelésszám>`),
both carrying the per-product details, the set-discount summary, the order
code, and the transaction identifier. Email delivery goes through Cloudflare
Email Sending (REST); previews/dev run file transport and physically cannot
email a buyer.

The per-product description is built server-side from each order line's
`selections` and the product's canonical definition: visible fields only,
indented by dependency depth, choice labels and material/thread-colour labels
in the order's language (`hu` fallback), toggles as Igen/Nem, a custom choice
value as `Egyedi: <value>`; the line title is the product's name and a
length-priced line shows its length. Each product is a heading (number,
title, quantity) over a label: value list, with no option prices or
subtotals, in the buyer confirmation and the owner notification alike.
Delivery SHALL be its own row (method name and its price, or "ingyenes" when a
promotion zeroed a charged price) and the only price in the confirmation is
the order total. The set-discount summary is generated from the order's
discount adjustments.

- **Scenario: Successful submission**
  - WHEN a complete order is transitioned to `ArrangingPayment`
  - THEN the buyer sees a confirmation showing the order code, a new empty
    basket starts, both emails are sent with details
    built from the lines' `selections`, and the order is not kept in an
    active state
- **Scenario: Submission failure**
  - WHEN any step is refused or the network request fails
  - THEN the buyer sees a generic error message followed by the failure reason
    (network error, server error with its HTTP status, or the backend's own
    message) and a reference code (the first 8 characters of the transaction
    identifier); the buyer can retry and the order stays intact
  - AND an error report of kind `order` carrying the reference code is sent to
    the site's own `/client-errors` endpoint, which logs it to Workers Logs

### Legacy orders

The `submitQuoteOrder` mutation and the quote-order plugin were removed after
the native checkout replaced them (roadmap S5, ADR 0013 decision 8). Orders
placed by the legacy flow are preserved as placed: their lines keep every
stored snapshot custom field (`title`, `configText`, `detailsJson`,
`selections`, `lengthCm`, the `quoted*` prices, the set-discount summary), the
custom-field definitions stay so those columns are never dropped, and the
dashboard order-detail extension renders them from the stored fields. No code
re-resolves or re-prices a placed order line.

### Browser error reporting

The system SHALL report uncaught browser errors and unhandled promise
rejections on every page to the site's own `/client-errors` endpoint (kind
`uncaught`), never to the API host, so reports arrive when the API is
unreachable. Reporting SHALL never break the page.

### Conversion tracking

The system SHALL record a Google Ads conversion (a `gtag('event', 'conversion')`
call through the GTM data layer) when the backend accepts the submission,
carrying the order's total (the Vendure order total with tax, in the order's currency) and the same transaction identifier
that was stored with the order. No conversion SHALL be recorded when the
submission fails. The call is only _pushed_ into the data layer
unconditionally; whether it is transmitted depends on the visitor's marketing
consent (see the consent-tracking spec).

- **Scenario: Successful submission**
  - WHEN the backend accepts the order
  - THEN a conversion event is recorded with the order total (HUF) and the
    transaction identifier stored with the order
- **Scenario: Submission failure**
  - WHEN the backend rejects the submission or the network request fails
  - THEN no conversion event is recorded
