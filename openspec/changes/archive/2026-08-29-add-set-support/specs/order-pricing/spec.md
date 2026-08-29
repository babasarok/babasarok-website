# order-pricing

## MODIFIED Requirements

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

## ADDED Requirements

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
