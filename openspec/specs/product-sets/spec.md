# product-sets

## Purpose

Lets the shop group products into sets that carry a single percent discount,
detect which basket lines form a set (material-gated, globally allocated), and
surface each line's set status to the buyer.

## Requirements

### Requirement: Product set content model

The system SHALL model a set as a CMS product group with a title, an optional
discount percentage (0–100), and a list of member products. A set with no
discount percentage grants no discount.

#### Scenario: Defining a set

- **WHEN** an editor creates a product group with a discount percentage and
  member products
- **THEN** the group loads as a set with that percent shared by all members

#### Scenario: Set without discount

- **WHEN** a product group has no discount percentage
- **THEN** its members earn no set discount from that group

### Requirement: Set discount resolution

For a product that is a member of one or more discounted sets, the system
SHALL resolve the set discount to the single set with the largest discount
percentage; discounts MUST NOT stack across sets. A product that is a member
of no discounted set earns no set discount.

#### Scenario: Product in multiple sets

- **WHEN** a product belongs to two sets with different discount percentages
- **THEN** only the set with the larger percentage is applied to that product

#### Scenario: Product in no set

- **WHEN** a product in the basket is a member of no discounted set
- **THEN** it earns no set discount and falls back to its standalone discount
  behavior

### Requirement: Material-gated set detection

Two basket lines count towards the same set only when they are different
products whose selected material values match exactly (same materials and
colors, compared order-independently). Lines without material
selections match trivially.

#### Scenario: Matching materials

- **WHEN** two set members in the basket have identical material selections
  (in any order)
- **THEN** they count towards the set

#### Scenario: Differing materials

- **WHEN** two set members in the basket have different material selections
- **THEN** they do not count towards the set, and the line reports a
  pending-material state offering to sync materials when possible

#### Scenario: Same product is not a partner

- **WHEN** two lines of the same set product are in the basket
- **THEN** they do not pair with each other towards the set

### Requirement: Global set allocation

The system SHALL allocate set units across the whole basket in one pass: one
set consumes one unit each of two different set members with matching
materials, and each basket unit is consumed at most once. A partner line MAY
cover no more sets than it has units.

#### Scenario: Partner line cap

- **WHEN** the basket holds two lines of set member A and one line of set
  member B with matching materials
- **THEN** exactly one set is formed (the single B unit pairs with one A unit)
  and the remaining A unit earns no set discount

#### Scenario: Partners consumed by other lines

- **WHEN** an item's matching partners are all allocated to other lines
- **THEN** the item reports a pending-partner state rather than an active
  discount

### Requirement: Set status surfacing

The system SHALL surface each basket line's set state in the order UI: active
discount (with the winning set and covered count), pending-partner (a
matching set sibling is not in the basket / all units already allocated), and
pending-material (a sibling is present but materials differ, with a
one-click material sync offered when the sibling's materials are available on
the line). The product configurator SHALL offer to add related set members.

#### Scenario: Pending partner hint

- **WHEN** a set member is in the basket but no matching partner is
- **THEN** the line shows a hint that the set discount is pending and offers
  the set's related members

#### Scenario: One-click material sync

- **WHEN** a pending-material line's partner uses materials available on the
  line
- **THEN** the UI offers a one-click action that copies the partner's material
  selection onto the line
