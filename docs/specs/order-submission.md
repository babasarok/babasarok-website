# Order submission

Lets buyers place an order request for configured products: an order form on
the checkout page collects the basket plus contact and delivery details, shows
the computed order total, and submits the order to the shop's Vendure backend
(`submitQuoteOrder` mutation on the shop API), which stores it as a Vendure
order and emails the buyer and the shop owner.

## Requirements

### Order form

The system SHALL provide the order form on a dedicated checkout page
(`/checkout`), where a buyer can manage the basket lines (quantity, fields,
materials, removal), see active set deals, choose a delivery method, and
provide name, email, phone, delivery address, and an optional message. The
contact page SHALL NOT host the order form; it keeps the contact information
and links to the checkout page.

- **Scenario: Configuring an order**
  - WHEN a buyer adds products with their selections and fills in their
    contact details on the checkout page
  - THEN the form shows each line with its price and a running order total
- **Scenario: Delivery method selection**
  - WHEN a buyer selects a delivery method
  - THEN the method's price is included in the order total, and an address
    field is required when the method requires one
- **Scenario: Free delivery above a threshold**
  - WHEN the selected delivery method carries a `free_above` threshold and the
    basket's products subtotal (the items subtotal after standalone and set
    discounts, before delivery) is strictly greater than that threshold
  - THEN the method is charged at 0 in the order total and its shipping line is
    shown/reported as free (ingyenes), never at the method's nominal price
- **Scenario: Contact page without form**
  - WHEN a visitor opens the contact page
  - THEN they see the contact information and a link to the checkout page,
    but no order form

### Order validation

The system SHALL validate the order before submission: every line must be
complete (required fields and materials chosen), a delivery method must be
selected, an address must be present when required, name/email must be
provided, and the buyer must accept the general terms of service (ÁSZF). The
terms acceptance is not persisted across visits; it must be given for every
order.

- **Scenario: Incomplete order**
  - WHEN a buyer attempts to submit an order with an incomplete line or
    missing required details
  - THEN the submission is blocked and a message tells the buyer what to fix
- **Scenario: Terms not accepted**
  - WHEN a buyer attempts to submit an order without accepting the general
    terms of service
  - THEN the submission is blocked until the terms are accepted

### Order total

The system SHALL compute the order total as the sum of all line total prices
plus the selected delivery method's charged price. A delivery method MAY carry a
`free_above` threshold in forint; the threshold is judged on the basket's
products subtotal (the items subtotal after standalone and set discounts,
before delivery). When that subtotal is strictly greater than the threshold,
the method is charged at 0.

- **Scenario: Total with delivery**
  - WHEN a basket has lines and a delivery method is selected
  - THEN the order total equals the sum of the line totals plus the delivery
    price
- **Scenario: Free delivery**
  - WHEN the selected delivery method's `free_above` threshold is set and the
    products subtotal is strictly greater than it
  - THEN the order total equals the sum of the line totals (delivery added as 0)

### Order submission

The system SHALL submit the order as a `submitQuoteOrder` mutation to the
Vendure shop API, carrying the buyer's name, email, phone, delivery method
(and address when required, plus a `deliveryFree` flag instead of the price
when the method is charged at 0 by its free-delivery threshold), message, the
terms acceptance flag, the computed total, one text block per product
describing its quantity, configured fields (indented per dependency level),
materials with colors, price breakdown, unit price (and per-meter price for
length-priced items), and line total — plus a unique transaction identifier
generated per submission attempt. Set discounts SHALL be described at basket
level: the payload SHALL summarize each formed set instance (set title, forint
amount, and which items/units it covers) so each discount maps unambiguously
to specific products.

The backend SHALL validate the payload (zod schema), store it as a Vendure
order with the quoted prices and text blocks as order/line custom fields, and
return the generated order code. The computed prices travel with the order as
the price authority (ADR 0002); the backend stores them as-is.

On the AddingItems → ArrangingPayment transition the backend SHALL email the
buyer a confirmation (subject: `Köszönjük a rendelésed: <rendelésszám>`) and
the shop owner a notification (subject: `Új árajánlatkérés:
<rendelésszám>`), both carrying the per-product blocks, the set-discount
summary, the order code, and the transaction identifier. Email delivery goes
through Cloudflare Email Sending (REST); previews/dev run file transport and
physically cannot email a buyer.

- **Scenario: Successful submission**
  - WHEN a valid order is submitted and the backend accepts it
  - THEN the buyer sees a confirmation, the order is stored with its quoted
    prices, and the order is not kept in a re-submittable failed state
- **Scenario: Submission failure**
  - WHEN the backend rejects the payload or the network request fails
  - THEN the buyer sees a generic error message and can retry; the order
    details remain intact

### Conversion tracking

The system SHALL record a Google Ads conversion (a `gtag('event', 'conversion')`
call through the GTM data layer) when the backend accepts the submission,
carrying the computed order total in HUF and the same transaction identifier
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
