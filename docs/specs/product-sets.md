# Product sets

Lets the shop group products into sets that carry a single percent discount,
detect which basket lines form a set (material-gated, globally allocated per
unit), and surface the formed set discounts to the buyer at basket level.

## Requirements

### Product set content model

The system SHALL model a set as a CMS product group with a title, an optional
discount percentage (0–100), and a list of member products. A set with no
discount percentage grants no discount.

- **Scenario: Defining a set**
  - WHEN an editor creates a product group with a discount percentage and
    member products
  - THEN the group loads as a set with that percent shared by all members
- **Scenario: Set without discount**
  - WHEN a product group has no discount percentage
  - THEN its members earn no set discount from that group

### Set discount resolution

For a product that is a member of one or more discounted sets, the system
SHALL resolve the set discount to the single set with the largest discount
percentage; discounts MUST NOT stack across sets. A product that is a member
of no discounted set earns no set discount.

- **Scenario: Product in multiple sets**
  - WHEN a product belongs to two sets with different discount percentages
  - THEN only the set with the larger percentage is applied to that product
- **Scenario: Product in no set**
  - WHEN a product in the basket is a member of no discounted set
  - THEN it earns no set discount and falls back to its standalone discount
    behavior

### Material-gated set detection

Two basket lines of different set-member products count towards the same set
only when their selected material values are compatible: the smaller
selection is a subset of the larger (every selected material id and colors
appears identically — at least as often — on the other, compared
order-independently). Material counts need not be equal. Lines without
material selections match trivially.

- **Scenario: Subset materials match**
  - WHEN two set members in the basket share materials and the smaller
    selection is contained in the larger (e.g. a one-fabric blanket and a
    two-fabric nest that shares that fabric)
  - THEN they count towards the set
- **Scenario: Non-subset materials do not match**
  - WHEN two set members' material selections are neither identical nor
    subset-related (e.g. a blanket in a fabric the nest doesn't use)
  - THEN they do not count towards the set, and the line reports a
    pending-material state offering to sync materials when possible
- **Scenario: Same product is not a partner**
  - WHEN two lines of the same set product are in the basket
  - THEN they do not pair with each other towards the set

### Set discount instances and allocation

A **set discount instance** is one unit each of two or more distinct set
members whose materials are pairwise compatible. The system SHALL allocate
set units across the whole basket in one greedy pass, processing sets biggest
discount percent first: for a set, it repeatedly forms a maximal instance
(one available unit from each distinct compatible member, basket order),
consuming units globally — each basket unit is consumed at most once, so a
partner line covers no more sets than it has units. Leftover units earn no
set discount. A unit consumed by a higher-percent set is unavailable to
lower-percent sets.

- **Scenario: Partner line cap**
  - WHEN the basket holds two lines of set member A and one line of set
    member B with matching materials
  - THEN exactly one set instance is formed (the single B unit pairs with
    one A unit) and the remaining A unit earns no set discount
- **Scenario: Partners consumed by other lines**
  - WHEN an item's matching partners are all allocated to other lines
  - THEN the item reports a pending-partner state rather than an active
    discount
- **Scenario: Biggest percent first per unit**
  - WHEN a basket unit can belong to instances of sets with different
    percentages
  - THEN the higher-percent set is allocated first, and the unit is not
    available to the lower-percent set

### Set status surfacing

The basket/checkout SHALL show a "set discounts" section listing each formed
instance (set title, percent, and which lines/units belong to it), with no
per-line discount labels. Each basket line SHALL additionally surface its set
state: active discount (with the winning set and covered count),
pending-partner (a matching set sibling is not in the basket / all matching
units already allocated), and pending-material (a sibling is present but
materials differ, with a one-click material sync offered when the sibling's
materials are available on the line). The product configurator SHALL offer to
add related set members.

- **Scenario: Basket-level instance list**
  - WHEN set instances are formed in the basket
  - THEN the checkout lists each instance with its set title, percent, and
    the member lines with their unit counts
- **Scenario: Pending partner hint**
  - WHEN a set member is in the basket but no matching partner is
  - THEN the line shows a hint that the set discount is pending and offers
    the set's related members
- **Scenario: One-click material sync**
  - WHEN a pending-material line's partner uses materials available on the
    line
  - THEN the UI offers a one-click action that copies the partner's material
    selection onto the line
