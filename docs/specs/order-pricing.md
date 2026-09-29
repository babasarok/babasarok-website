# Order pricing

Computes the price of an order item from its base price, selected configurable
field options, selected materials, quantity, and any applicable discount. A
price is only surfaced once it can be fully computed; an unpriced part is
treated as contributing nothing rather than producing a partial price.

## Requirements

### Price part composition

The system SHALL compute an item's unit price as the sum of the product's base
price, the prices of all visible and selected priced configurable fields, and
the prices of all required material selections. Each part's price MUST be
rounded to whole units before summing.

- **Scenario: Base price plus options**
  - WHEN a buyer selects priced options (e.g. a fabric variant, an extra
    toggle) on a product
  - THEN the item's unit price equals the base price plus the sum of the
    selected options' prices, each shown as a named line in the price
    breakdown
- **Scenario: Material prices**
  - WHEN a product requires materials and the buyer selects them
  - THEN each selected material contributes its price to the unit price, with
    one labeled line per material slot

### Quantity

The system SHALL multiply the unit price by the item's quantity to obtain the
item's total price.

- **Scenario: Multiple units**
  - WHEN an item's quantity is greater than one
  - THEN the item total equals unit price times quantity

### Standalone product discount

A product MAY carry a discount percentage and a `discount_valid_until` date.
The system SHALL apply the discount as a multiplier (`1 - percent/100`) on the
item's total price only while the current date is on or before
`discount_valid_until`; otherwise no standalone discount applies. A standalone
discount applies to every unit of the line, including units that also belong to
a set instance (set and standalone discounts stack).

- **Scenario: Discount within validity**
  - WHEN a product has a discount and its `discount_valid_until` is in the
    future
  - THEN the item total is reduced by the discount percentage and the
    discount is surfaced in the price breakdown
- **Scenario: Expired discount**
  - WHEN a product's `discount_valid_until` date has passed
  - THEN no standalone discount is applied to the item
- **Scenario: Stacks with a set discount**
  - WHEN a set-covered item also has a valid standalone discount
  - THEN the standalone discount reduces the whole line and the set discount
    is deducted from the already-discounted subtotal on top of it

### Length-based pricing

A product MAY be priced by length: a designated source field holds a length in
centimetres and the computed unit price is the per-meter price. The system
SHALL compute the unit price and total price scaled by the length in meters
when the length is known, and leave them undefined when it is not.

- **Scenario: Priced by length**
  - WHEN a length-priced product's source field holds a length value
  - THEN the unit price equals the per-meter price times the length in meters
    and the total price equals the per-meter price times length times
    quantity
- **Scenario: Missing length**
  - WHEN a length-priced product's source field has no valid length value
  - THEN the unit price and total price are not determined and no price is
    shown until a length is entered

### No product may be sold for 0 Ft

The build SHALL fail when an orderable product has any form-reachable
configuration that prices at 0 Ft — i.e. the product could be submitted for
free. The enumeration mirrors the order form's reachability rules: only
visible fields (`depends_on`) count, radio/select/color selections are
required (a custom value where `allow_custom_value` is set counts as a 0-Ft
selection), every required material slot must be filled subject to
`banned_combinations`, embroidery is optional, and the length source field of
a length-priced product is judged by its per-meter price (any length would
then sell for 0 Ft). Non-orderable (browse-only) products are exempt.

- **Scenario: Free combination exists**
  - WHEN an orderable product's base price plus every reachable selection
    yields 0 Ft for at least one complete configuration
  - THEN the build fails, naming the product and the offending combination(s)
- **Scenario: Length-priced product with 0 per-meter price**
  - WHEN a length-priced product's per-meter price is 0 Ft for some reachable
    option combination
  - THEN the build fails, since any length would sell for 0 Ft
- **Scenario: No free combination**
  - WHEN every form-reachable configuration of every orderable product prices
    above 0 Ft
  - THEN the build succeeds

### Set discount application

Set discounts are flat forint deductions applied at basket level, not per line.
Each formed set instance (see the product-sets capability) removes its set's
flat amount once from the order total, clamped so it never exceeds the covered
units' charged subtotal (after any standalone discount on those units). Line
prices themselves reflect only the standalone discount; the set deductions are
summed and subtracted from the order total. Set discounts are surfaced at basket
level (the "set discounts" section listing each formed instance and the forint
it removes), not as per-line labels. The order email records each line's
standalone discount and, per formed instance, the set title, its members, and
both the nominal and the actually applied (clamped) forint amount.

- **Scenario: Flat deduction**
  - WHEN a set instance forms in the basket
  - THEN the order total is reduced by the set's flat amount and the instance
    is listed in the basket-level set discounts section
- **Scenario: Clamped deduction**
  - WHEN a set instance's flat amount exceeds its covered units' charged
    subtotal
  - THEN only that subtotal is removed, and the email shows both the nominal
    and the applied amount
