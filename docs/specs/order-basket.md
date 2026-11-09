# Order basket

Holds the buyer's in-progress order as the Vendure active order (product
lines with quantities, field values, and material selections), so selections
survive page reloads and revisits and every amount comes from the server
([ADR 0013](../adr/0013-checkout-on-the-native-vendure-order-flow.md)).

## Requirements

### Basket lines

The system SHALL represent the basket as the Vendure active order of a guest
session, each line referencing a product variant and carrying the order-line
custom fields `selections` (the buyer's field values, including the
`material` picks and their colours, as JSON) and `lengthCm` (length-priced
products). Lines are changed with `addItemToOrder`, `adjustOrderLine` and
`removeOrderLine`; the line's price is the server pricing strategy's unit
price, and the order exposes each line's `unitPriceWithTax`, the order totals
and `currencyCode` (nothing in the API is currency-specific).

- **Scenario: Adding a product**
  - WHEN a buyer configures a product (quantity, options, materials) and adds
    it to the order
  - THEN the order holds a line for that variant carrying exactly those
    `selections`, priced by the server
- **Scenario: Adding a duplicate line**
  - WHEN a buyer adds a line identical to an existing one (same variant,
    `selections` and `lengthCm`)
  - THEN the quantities merge into a single line rather than creating a
    duplicate
- **Scenario: Removing a line**
  - WHEN a buyer removes a product from the order
  - THEN the order no longer holds a line for that selection
- **Scenario: Set discount**
  - WHEN the lines form a discounted product set (product-sets spec)
  - THEN the set promotion applies on the active order and shows in the
    lines' discounts and the order totals

### Shop-API line validation

The system SHALL refuse, with a Hungarian buyer-facing message naming the
product, an order line whose `selections` the product's own fields cannot
accept. Refused: an unknown field id; a record whose kind does not fit its
field (input → `input`, choice → `option`/`custom`, toggle → `option`,
material → `material`, embroidery → `embroidery`); a choice option or toggle
value the field does not offer; a `custom` value on a choice without
`customValue`, or any custom/input/embroidery value breaking the field's
pattern; a material the colour list of which does not contain a picked colour,
or that repeats a colour; input, custom or embroidery text over 200
characters; material picks (an unpicked material field counting as its first
listed material) that complete one of the product's forbidden material
combinations. `lengthCm` is a whole number from 1 to 10,000 (100 m); Vendure
refuses values outside it. The refusal reaches the site as an `OrderInterceptorError`
whose `interceptorError` field carries the Hungarian message (its generic `message`
does not).

- **Scenario: Foreign colour**
  - WHEN a line picks a colour the referenced material does not offer
  - THEN adding or adjusting the line is refused

### Basket persistence

The system SHALL keep the basket server-side as the active order, identified
by the bearer session token the shop API returns (`vendure-auth-token`
response header). The site SHALL store only that token in browser
localStorage under a versioned key; selections and quantities are never
persisted client-side, and contact details are never kept in the browser
(they live on the active order, see the order-submission spec). The only
other stored value is, per order line in sessionStorage, the unit price the
product page showed when the line was added (used solely for the price-change
notice). Client baskets from before the cutover are dropped (the old key is
removed once), not migrated.

- **Scenario: Reload restores the basket**
  - WHEN a buyer with a stored session token returns to the site
  - THEN `activeOrder` returns their order and the lines are shown
- **Scenario: Stale or corrupt token**
  - WHEN the stored token is rejected or its order is no longer active
  - THEN it is discarded and the basket starts empty
- **Scenario: Storage unavailable**
  - WHEN localStorage is unavailable (e.g. blocked by the browser)
  - THEN the basket still works in-session without persisting and without
    erroring

### Stale lines

The system SHALL expose on every shop-API `OrderLine` an `invalidReason`
(`{ code, message }`, null when the line is fine) with the codes
`NOT_ORDERABLE` (the product is no longer orderable), `VARIANT_UNAVAILABLE`
(the variant is disabled or deleted) and `OPTION_NOT_OFFERED` (the line's
`selections`/`lengthCm` no longer fit the product definition or cannot be
priced); `message` is Hungarian and buyer-facing. A line keeps the price it
had when it was added or last adjusted; the site compares `unitPriceWithTax`
with the price its page showed. Placing an order with an invalid line is
refused (order-submission spec).

- **Scenario: Option withdrawn after adding**
  - WHEN the owner removes an option a basket line selected
  - THEN the line's `invalidReason` is `OPTION_NOT_OFFERED` with a message,
    and removing or re-adjusting the line clears it
- **Scenario: Price changed on a stale page**
  - WHEN a line is added from a page showing an older price
  - THEN the line carries the server price and the site shows the
    difference (on the product page right after adding, and on the checkout
    line) instead of silently accepting it
- **Scenario: Invalid line at checkout**
  - WHEN a line has an `invalidReason`
  - THEN the checkout marks it with the message, it can be edited (the edit
    page re-opens it from its `selections`) or removed, and placing the order
    is blocked until it is resolved
- **Scenario: Refused add**
  - WHEN the shop API refuses an add (stale page, withdrawn option)
  - THEN the product page shows the server's Hungarian reason and offers to
    reload the page

### Editing a line

The system SHALL edit a basket line by opening its product page with
`?line=<order line id>`, prefilled from the line's `selections` and quantity.
Saving adjusts the quantity when the configuration is unchanged; otherwise it
adds the new configuration and then removes the old line (Vendure cannot change
a line's variant), so a refused add leaves the old line intact.

### Shared live basket

The system SHALL expose a single live basket view shared by every order UI on
the page (product configurators, nav basket, checkout form), reflecting the
active order and updating immediately when any of them changes it.
Changes made in another browser tab MUST be picked up.

- **Scenario: Cross-island update**
  - WHEN a buyer adds a product on a product page
  - THEN the nav basket count and any other order UI on the page update
    without a reload
- **Scenario: Cross-tab update**
  - WHEN the basket changes in a different browser tab
  - THEN the order UIs in this tab update to reflect the change

### Navigation basket

The system SHALL show a basket indicator in the site header on all pages
except the checkout page, displaying the total number of basket units and
linking to the checkout page.

- **Scenario: Header count**
  - WHEN the basket contains units
  - THEN the header shows a basket link with that total count
- **Scenario: On the checkout page**
  - WHEN a visitor is on the checkout page
  - THEN the header does not show the basket indicator
