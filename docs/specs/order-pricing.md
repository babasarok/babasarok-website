# Order pricing

Computes the price of an order item from its base price, selected configurable
field options, selected materials, and quantity. A
price is only surfaced once it can be fully computed; an unpriced part is
treated as contributing nothing rather than producing a partial price.

## Where the rules live

The line-pricing rules (price composition, length scaling, field visibility,
selection validation, forbidden material combinations) are implemented once, in
the pure workspace package `packages/pricing` (`@babasarok/pricing`, depending
only on zod and `@babasarok/product-definition`). The backend pricing strategy
and the order-line boundary call it; it prices a canonical `ProductDefinition`
plus the line's selections and variant options. The site's configurator shows a
live unit price from the package (`src/lib/catalog/livePrice.ts`) and an option
breakdown from `src/lib/pricing/price.ts` (display only); every basket and
checkout amount is read from the Vendure order, and the set discount is a server
promotion.

Selection problems are structured (`field`, `code`, detail) and rendered by one
formatter; a selection is also refused when a material field carries fewer
colours than its `colorCount` requires (a `from-field` count is checked only
once the source field has a numeric answer). A forbidden material combination is
a multiset of material ids (`[X, X]` bans X on two fields; `[X, Y]` bans the pair
wherever they sit); variant generation omits every variant whose materials
cover a rule, and the package exposes the same rule to the configurator.

## Requirements

### Price part composition

The system SHALL compute an item's unit price as the sum of the product's base
price, the prices of all visible priced configurable fields, and the price of
each selected `material` field. A choice or toggle option's price counts only
when that option is selected; an input field's price applies while the field is
visible even when left empty. Each part's price MUST be rounded to whole units
before summing.

- **Scenario: Base price plus options**
  - WHEN a buyer selects priced options (e.g. a fabric variant, an extra
    toggle) on a product
  - THEN the item's unit price equals the base price plus the sum of the
    selected options' prices, each shown as a named line in the price
    breakdown
- **Scenario: Material prices**
  - WHEN a product has `material` fields and the buyer picks their materials
  - THEN each selected material contributes its price to the unit price, with
    one labeled line per `material` field (labeled by the field; an
    as-yet-unchosen material selection contributes nothing)

### Quantity

The system SHALL multiply the unit price by the item's quantity to obtain the
item's total price.

- **Scenario: Multiple units**
  - WHEN an item's quantity is greater than one
  - THEN the item total equals unit price times quantity

### Standalone product discount

**Dropped.** Per-product % discounts are retired (owner decision; no Tina
content ever sets `discount`, so behavior is unchanged). The dormant site
code goes away at cutover without a Vendure replacement, and the canonical
product model carries no discount field. Set discounts (below) are
unaffected.

### Length-based pricing

A product MAY be priced by length: a designated source field holds a length in
centimetres and the computed unit price is the per-meter price. The system
SHALL compute the unit price and total price scaled by the length in meters
when the length is known, and leave them undefined when it is not. The length
is a whole number of centimetres (the order line carries it as an integer); a
fractional length is not quotable. Prices are whole forints: the unit price of
a length-priced item is the per-meter price times the length in centimetres
divided by 100, rounded to whole forints once, and the line total is that unit
price times the quantity — no further rounding.

- **Scenario: Priced by length**
  - WHEN a length-priced product's source field holds a length value
  - THEN the unit price equals the per-meter price times the length in meters
    and the total price equals the per-meter price times length times
    quantity
- **Scenario: Missing length**
  - WHEN a length-priced product's source field has no valid length value
  - THEN the unit price and total price are not determined and no price is
    shown until a length is entered
- **Scenario: Whole-forint rounding**
  - WHEN the per-meter price times the length does not come out even
    (e.g. 995 Ft/m × 335 cm)
  - THEN the unit price is that product rounded to whole forints once
    (995 × 335 ÷ 100 → 3333 Ft) and the line total is that unit price times
    the quantity

### No product may be sold for 0 Ft

The build SHALL fail when an orderable product has any form-reachable
configuration that prices at 0 Ft — i.e. the product could be submitted for
free. The enumeration mirrors the order form's reachability rules: only
visible fields (`depends_on`) count, radio/select/color selections are
required (a custom value where `allow_custom_value` is set counts as a 0-Ft
selection), every `material` field must have a material picked — each entry of
the field's `materials` list is one choice, and a choice is pruned when it
would complete a `banned_combinations` entry, mirroring the form's validation;
the colour selection is never enumerated, since it cannot change the price;
embroidery
is optional, and the length source field of
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

> **Transition note (ADR 0009/0010).** During the transition this rule is
> enforced twice with the same enumeration: by the site build (today) and by
> Vendure's product-definition validation on every definition save
> (`backend/src/plugins/product/`). The 0 Ft native variant prices on
> length-priced products are not buyer-reachable since the pricing step: the
> server prices configured order lines itself — a custom
> `OrderItemPriceCalculationStrategy` computes the unit price from the
> canonical product definition and the order line's selections (a length in
> cm plus per-field picks — materials with their colors, embroidery text and
> thread color, input texts, color picks) — and a length-priced line without
> a length is rejected when the item is added or adjusted, with the strategy
> refusing to price it as the backstop. Never a 0 Ft line. The generated
> native variant list prices follow the same visibility rule: a variant's
> price is the base price plus only the option prices of variant-axis fields
> visible given the variant's own picks — a field hidden by `depends_on` rides
> the matrix but contributes nothing, so no variant charges for a selection
> the order form cannot offer (the length walk's per-meter price obeys the
> same rule). A basket add or adjust for a non-orderable (`orderable: false`)
> product is likewise rejected at the mutation boundary, with the strategy
> refusing to price it as the backstop (ADR 0011 decision 5). These
> rejections are Hungarian and name the product by its native name. An
> embroidery selection whose `colorId` is not a value code of the private
> `babasarok-thread-color` facet is rejected at the same boundary (ADR 0011
> decision 3; one lookup per add/adjust, only when the line carries an
> embroidery selection). The site
> never prices a basket itself: lines carry the server's unit price. An open owner question: a `customValue` choice
> field used as a variant axis cannot select a generated variant, and the
> server refuses to price such a line — whether such fields may exist outside
> length source fields is undecided; none exist in current content.

### Lines whose definition changed after they were added

#### Scenario: a stale line keeps its price

- **WHEN** a line already on the order can no longer be priced from its
  product's current definition (made non-orderable, field/option/material
  removed)
- **THEN** every recalculation keeps the line's last unit price instead of
  failing, so unrelated mutations keep working
- **AND** adding a new line that cannot be priced is still refused

#### Scenario: a stale line blocks placing the order

- **WHEN** the order moves from `AddingItems` to `ArrangingPayment` while any
  line cannot be priced from its current definition
- **THEN** the transition is refused with a Hungarian message naming the
  product by its native name
- **AND** removing or adjusting the line clears the refusal

### Set discount application

Set discounts are flat forint deductions applied at basket level, not per line.
Each formed set instance (see the product-sets capability) removes its set's
flat amount once from the order total, clamped so it never exceeds the covered
units' charged subtotal. The allocation is computed in one global greedy pass
per basket: the single "Szett kedvezmény" promotion's condition reads all
discounted-set collections itself and takes no arguments, and exactly one such
promotion must exist — the condition refuses when more than one active
promotion uses it, so overlapping copies cannot double-count. Set deductions
are summed and subtracted from the order total. Set discounts are surfaced at
basket
level (the "set discounts" section listing each formed instance and the forint
it removes), not as per-line labels. The order email records, per formed
instance, the set title, its members, and
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
