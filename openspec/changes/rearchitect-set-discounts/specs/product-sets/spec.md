## MODIFIED Requirements

### Requirement: Set discount resolution

For each basket **unit** that could belong to one or more discounted sets, the
system SHALL apply the single set with the largest discount percentage that
actually forms an instance covering that unit; discounts MUST NOT stack.
Allocation proceeds biggest-percent-first across sets, and each unit is included
in at most one set discount. A unit that joins no set-discount instance falls
back to the product's standalone discount behavior.

#### Scenario: Product in multiple sets

- **WHEN** a unit's product belongs to two sets that both form an instance for
  it, with different discount percentages
- **THEN** the unit is included in the set with the larger percentage only

#### Scenario: One line spanning two sets

- **WHEN** a line has count 2, and its product is a member of two different sets
  that each form an instance with other matching basket units
- **THEN** one of the line's units is allocated to each set discount

#### Scenario: Product in no set

- **WHEN** a unit joins no set-discount instance
- **THEN** it earns no set discount and falls back to its standalone discount
  behavior

### Requirement: Material-gated set detection

Two basket units count towards the same set instance only when they are
different set-member products whose selected material values are **compatible**:
the unit with fewer selected materials MUST be a subset of the other — every
material it selected (id, colors and custom color, compared order-independently)
appears identically on the other unit. Material _counts_ need not be equal. All
units within a single instance MUST be pairwise compatible. Units without
material selections match trivially.

#### Scenario: Matching materials

- **WHEN** a set member selecting one fabric and another selecting two fabrics
  share that one fabric identically (the first's selection is a subset of the
  second's)
- **THEN** they count towards the set

#### Scenario: Differing materials

- **WHEN** two set members in the basket select conflicting material values
  (neither selection is a subset of the other)
- **THEN** they do not count towards the set, and the line reports a
  pending-material state offering to sync materials when possible

#### Scenario: Same product is not a partner

- **WHEN** two units of the same set-member product are in the basket
- **THEN** they do not pair with each other towards the set

### Requirement: Global set allocation

The system SHALL allocate set discounts across the whole basket per **unit** in
one pass, processing sets by descending discount percentage. A **set-discount
instance** consumes one unit each of **two or more distinct** set members whose
materials are mutually compatible. Within a material-matching cohort the system
SHALL form one **maximal** instance (all mutually-compatible distinct members
that have unallocated units), then repeat while at least two distinct members
still have unallocated units. Each unit is consumed at most once; leftover units
earn no set discount.

#### Scenario: Maximal instance across members

- **WHEN** a three-member set has one matching unit of each member in the basket
- **THEN** one instance is formed covering all three units, each earning the
  set's percent

#### Scenario: Leftover unit after a maximal instance

- **WHEN** a three-member set has two units of member A and one each of B and C,
  all matching
- **THEN** one maximal instance {A, B, C} is formed and the extra A unit earns
  no set discount (it is not split into a second smaller instance)

#### Scenario: Repeated instances while members remain

- **WHEN** a two-member set has two matching units of member A and two of member
  B
- **THEN** two instances are formed, covering all four units

#### Scenario: Partner line cap

- **WHEN** the basket holds two units of set member A and one of set member B
  with matching materials
- **THEN** exactly one instance is formed and the remaining A unit earns no set
  discount

#### Scenario: Partners consumed by other lines

- **WHEN** an item's matching partners are all allocated to other instances
- **THEN** the item reports a pending-partner state rather than an active
  discount

#### Scenario: Biggest percent first across sets

- **WHEN** a unit could join a 10% set or a 20% set that both form an instance
- **THEN** it is allocated to the 20% set, and the 10% set draws only from units
  left unallocated

### Requirement: Set status surfacing

The system SHALL surface set discounts at the **basket level**: the order UI
SHALL list every formed set-discount instance with its set title, discount
percent, and the member lines (and per-line unit counts) it contains, so the
buyer can see which items form each set. Per-line active-discount labels and a
per-item discount-source line in the order submission are not required. Pending
states remain as hints: pending-partner (a matching set sibling is not in the
basket / all units already allocated) and pending-material (a sibling is present
but materials are incompatible, with a one-click material sync offered when the
sibling's materials are available on the line). The product configurator SHALL
offer to add related set members.

#### Scenario: Basket-level instance list

- **WHEN** the basket contains one or more formed set-discount instances
- **THEN** the order UI shows each instance with its set title, percent, and the
  member lines/units belonging to it

#### Scenario: Pending partner hint

- **WHEN** a set member is in the basket but no matching partner is
- **THEN** the UI shows a hint that the set discount is pending and offers the
  set's related members

#### Scenario: One-click material sync

- **WHEN** a pending-material line's partner uses materials available on the
  line
- **THEN** the UI offers a one-click action that copies the partner's material
  selection onto the line

## ADDED Requirements

### Requirement: Set-discount instance is the unit of discount

The system SHALL treat the set-discount **instance** — a group of one unit each
of two or more distinct, mutually material-compatible set members — as the unit
at which a set discount is granted. Every unit in an instance earns the
instance's set percent; a basket line with count greater than one MAY have its
units distributed across multiple instances (including instances of different
sets). Pricing and the basket-level display SHALL both derive from the same
allocation so a shown discount and a charged discount can never disagree.

#### Scenario: Every unit in an instance is discounted

- **WHEN** a set-discount instance is formed from units of members A, B and C
- **THEN** each of those three units earns the instance's set percent

#### Scenario: Shared allocation drives price and display

- **WHEN** the basket-level set-discount list and the charged total are computed
- **THEN** both derive from one allocation pass over the basket, yielding
  identical instances and amounts
