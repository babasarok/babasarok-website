# Product sets

Lets the shop group products into sets that carry a single flat forint discount,
detect which basket lines form a set (material-gated, allocated per set per
unit), and surface the formed set discounts to the buyer at basket level.

> **Transition note (ADR 0014).** Since the promotions step (roadmap
> epic 2) the set-discount model lives entirely in Vendure Promotions: each
> discounted set is one active Promotion — the condition
> (`babasarok-product-set-members`) args list the member products, the
> action (`babasarok-product-set-discount`) arg is the flat forint amount,
> and the promotion's Hungarian name is the set label. The material gating
> is the condition's built-in behavior: it derives each basket line's
> material picks from the line's variant options (the authoritative material
> axes) with the colors from the order-line `selections` — a line whose
> required colors are missing or unprovable forms no instance. Two active
> set promotions must not share a product (enforced at save, refused at
> runtime); no set is hidden in Collections any more — related-items groups
> are private top-level Collections (label = collection name, members = the
> native `product-id-filter`; public top-level collections are material
> navigation, so `isPrivate` is the whole distinction). Degenerate
> groups (<2 members, no amount) are ignored with a report, not thrown.
> The checkout renders the set section and the per-line set state from the
> shop API (`Order.setDiscounts`, `OrderLine.setState`) through one adapter
> in `src/lib/basket/setDiscounts.ts`, never recomputing allocation in the
> browser; it renders nothing until the API exposes those fields. The
> per-line status surfacing (active / pending-partner / pending-material
> with material sync), the related-items presentation, and the email's
> per-instance provenance are Vendure-owned data.

## Requirements

### Product set content model

The system SHALL model a set as a Promotion whose condition args list the
member products and whose action arg is an optional flat forint discount
amount (a positive integer). The promotion's Hungarian name is the set's
title. A promotion without the set action, disabled, or with a zero amount is
not a set: it grants no discount and its members are surfaced as related
items (cross-sell) only through a related-items collection.

- **Scenario: Defining a set**
  - WHEN the owner creates a Promotion with the set condition (member
    products), the set action (the Ft amount) and a Hungarian name
  - THEN the group loads as a set whose formed instances each remove that
    flat amount
- **Scenario: Promotion without the set action or amount**
  - WHEN a promotion has the set condition but no set action (or a zero
    amount)
  - THEN it grants no set discount and its members earn no set discount
- **Scenario: Overlapping sets are refused**
  - WHEN a second active set promotion lists a product that an active set
    promotion already lists
  - THEN the save is rejected with a Hungarian message, and the runtime
    allocation refuses to apply rather than double-count

### Set discount resolution

The system SHALL NOT apply more than one set discount to the same basket
unit. Overlapping membership is refused at save time (see the content
model), so each product belongs to at most one discounted set; the
allocation still treats the whole basket as one unit budget per set.

- **Scenario: Product in multiple sets**
  - WHEN two active set promotions would list the same product
  - THEN the second promotion cannot be saved while the first is active
- **Scenario: Product in no set**
  - WHEN a product in the basket is a member of no discounted set
  - THEN it earns no set discount

### Material-gated set detection

Two basket lines of different set-member products count towards the same set
only when their selected material values (the picks of their `material`
fields) are compatible: the smaller
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
each set's units across the whole basket in one greedy pass per set: it
repeatedly forms a maximal instance
(one available unit from each distinct compatible member; among
interchangeable units it prefers the one leaving the most members joinable,
then the most valuable unit, then basket order),
consuming units within the set — a partner line covers no more set instances
than it has units. Leftover units earn no
set discount. Each formed instance removes its set's flat forint amount
once, clamped so it never exceeds the covered units' charged subtotal.

- **Scenario: Partner line cap**
  - WHEN the basket holds two lines of set member A and one line of set
    member B with matching materials
  - THEN exactly one set instance is formed (the single B unit pairs with
    one A unit) and the remaining A unit earns no set discount
- **Scenario: Partners consumed by other lines**
  - WHEN an item's matching partners are all allocated to other lines
  - THEN the item reports a pending-partner state rather than an active
    discount
- **Scenario: Deduction clamped to the covered subtotal**
  - WHEN a formed instance's flat amount exceeds the charged subtotal of its
    covered units
  - THEN the instance removes only that subtotal, never driving it below zero

### Set status surfacing

The basket/checkout SHALL show a "set discounts" section listing each formed
instance (set title and the flat forint amount it removes, and which
lines/units belong to it), with no per-line discount labels. The flat discount
figure appears only in this basket-level section, never on the product page or
per line. Each basket line SHALL additionally surface its set state: active
discount (with the winning set and covered count), pending-partner (a matching
set sibling is not in the basket / all matching units already allocated), and
pending-material (a sibling is present but materials differ, with a one-click
material sync offered when the sibling's materials are available on the line).
The shop API SHALL expose this from the same allocation the set promotion
applies (never a second computation): `Order.setDiscounts` lists the formed
instances (group id, Hungarian title, the amount actually removed after the
clamp, and the member order lines with unit counts) and `OrderLine.setState`
carries each line's state (`ACTIVE` with the winning set and covered units,
`PENDING_PARTNER`, `PENDING_MATERIAL` with `materialSyncFromLineId` set when a
partner line's material picks are all offered on the line, otherwise null;
null for lines in no set). The fields reflect every active set promotion
whose member products are disjoint from the others'; while that disjointness
is violated the allocation refuses to apply and the fields are empty.
The product configurator SHALL offer to add related set members, and SHALL
present the members of any related-items collection the product belongs to as
a separate "related items" list per group.

- **Scenario: Basket-level instance list**
  - WHEN set instances are formed in the basket
  - THEN the checkout lists each instance with its set title, the forint
    amount it removes, and the member lines with their unit counts
- **Scenario: Pending partner hint**
  - WHEN a set member is in the basket but no matching partner is
  - THEN the line shows a hint that the set discount is pending and offers
    the set's related members
- **Scenario: One-click material sync**
  - WHEN a pending-material line's partner picks materials on fields that the
    line offers by the same field name
  - THEN the UI offers a one-click action that copies the partner's material
    selection onto the line's matching fields
- **Scenario: Related items for a related collection**
  - WHEN a product belongs to one or more related-items collections
  - THEN the product page shows those collections' other members as related
    items, one separate list per collection, with no discount figure
