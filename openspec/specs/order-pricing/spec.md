# order-pricing

## Purpose

Computes the price of an order item from its base price, selected configurable
field options, selected materials, quantity, and any applicable discount, and
flags prices that are only partial because some selections are unpriced.

## Requirements

### Requirement: Price part composition

The system SHALL compute an item's unit price as the sum of the product's base
price, the prices of all visible and selected priced configurable fields, and
the prices of all required material selections. Each part's price MUST be
rounded to whole units before summing.

#### Scenario: Base price plus options

- **WHEN** a buyer selects priced options (e.g. a fabric variant, an extra
  toggle) on a product
- **THEN** the item's unit price equals the base price plus the sum of the
  selected options' prices, each shown as a named line in the price breakdown

#### Scenario: Material prices

- **WHEN** a product requires materials and the buyer selects them
- **THEN** each selected material contributes its price to the unit price, with
  one labeled line per material slot

### Requirement: Quantity

The system SHALL multiply the unit price by the item's quantity to obtain the
item's total price.

#### Scenario: Multiple units

- **WHEN** an item's quantity is greater than one
- **THEN** the item total equals unit price times quantity

### Requirement: Standalone product discount

A product MAY carry a discount percentage and a `discount_valid_until` date.
The system SHALL apply the discount as a multiplier (`1 - percent/100`) on the
item's total price only while the current date is on or before
`discount_valid_until`, and only when the item earns no active set discount;
otherwise no standalone discount applies.

#### Scenario: Discount within validity

- **WHEN** a product has a discount, its `discount_valid_until` is in the
  future, and the item earns no active set discount
- **THEN** the item total is reduced by the discount percentage and the
  discount is surfaced in the price breakdown

#### Scenario: Expired discount

- **WHEN** a product's `discount_valid_until` date has passed
- **THEN** no standalone discount is applied to the item

#### Scenario: Superseded by set discount

- **WHEN** the item earns an active set discount and also has a valid
  standalone discount
- **THEN** only the set discount applies to the item

### Requirement: Length-based pricing

A product MAY be priced by length: a designated source field holds a length in
centimetres and the computed unit price is the per-meter price. The system
SHALL compute the unit price and total price scaled by the length in meters
when the length is known, and leave them undefined when it is not.

#### Scenario: Priced by length

- **WHEN** a length-priced product's source field holds a length value
- **THEN** the unit price equals the per-meter price times the length in
  meters and the total price equals the per-meter price times length times
  quantity

#### Scenario: Missing length

- **WHEN** a length-priced product's source field has no valid length value
- **THEN** the unit price and total price are not determined and the item is
  flagged as indeterminate

### Requirement: Indeterminate prices

The system SHALL flag an item as indeterminate when any price part has no
price (an unselected priced option or an unchosen material), so totals can be
presented as partial rather than final.

#### Scenario: Unpriced selection

- **WHEN** an item's selected option has no price defined
- **THEN** the item is indeterminate and its contribution to the order total is
  marked as a non-final price

### Requirement: Set discount application

An item earns at most one discount. When an item's set discount is active for
`n` of its `c` units, the system SHALL reduce the item total by the set
percentage applied to the fraction `n/c` of the total, rounded to whole
currency units. The discount source ("set" or "standalone") MUST be recorded so
the price breakdown and the order email can label it; a set discount is labeled
distinctly ("Szett kedvezmény") from the generic discount.

#### Scenario: Full allocation

- **WHEN** every unit of an item is allocated to a set
- **THEN** the item total is reduced by the set percentage and the breakdown
  labels it as a set discount, not the generic discount

#### Scenario: Partial allocation

- **WHEN** only some of an item's units are allocated to a set
- **THEN** the reduction equals the set percentage times the allocated
  fraction of the total
