## Why

The current set-discount model allocates discounts **pairwise** (one instance =
one unit of member A + one unit of member B) and gates matching on an **exact**
material equality that also requires the same _number_ of materials. This
mis-models real sets: a set can have 3+ members that should all share one
discount, members legitimately differ in how many fabrics they use (a blanket
uses one fabric, a nest uses two), and the discount is fundamentally a
**basket-level** fact ("these lines form a set") that the basket UI never shows.
The rules and the code have drifted from what the shop actually needs.

## What Changes

- **BREAKING (matching rule):** Two products count towards a set when the
  smaller material selection is a **subset** of the larger (every selected
  `material_id` + colors + custom color appears identically on the other).
  Material _count_ no longer has to be equal. (Was: exact equality incl. count.)
- **BREAKING (grouping):** A set discount is modeled as a **set-discount
  instance** — one unit each of **2 or more distinct** set members whose
  materials mutually match — instead of a fixed pair. Within a material-matching
  cohort the system forms one **maximal** instance (all matching distinct
  members), then repeats while ≥2 distinct members still have units; leftover
  units earn no set discount.
- **BREAKING (allocation):** Units are allocated per **unit**, biggest set
  **percent first**. A single line with count ≥ 2 may therefore contribute units
  to two different set discounts. (Preserves the existing "count 2 in two sets"
  caveat, now first-class.)
- **Basket-level display:** The basket/checkout gains a "set discounts" section
  that lists each formed instance (set title, percent) and **which lines/units**
  belong to it. Per-line discount labels and the per-item discount-source line
  in the submit/email text are **removed** in favor of this grouped view.
- **Kept:** product-page and checkout candidate suggestions (add a missing set
  member), plus the `pending-partner` and `pending-material` (one-click material
  sync) nudges — re-expressed against the new instance model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `product-sets`: replaces the pairwise, exact-match, per-line model with the
  subset-match, per-unit, maximal-instance allocation and basket-level instance
  surfacing described above. Affects the "Material-gated set detection", "Global
  set allocation", and "Set status surfacing" requirements, and adds a
  requirement describing the set-discount instance and basket-level grouping.

## Impact

- **Core logic:** `src/lib/priceUtils.ts` — `materialsMatch`/
  `normalizeMaterialValues` (subset rule), `allocateSetDiscounts` (per-unit,
  percent-first, maximal instances; now also returns the formed instances), and
  the `resolve*` helpers/`calculatePriceForItem` discount application.
- **Types:** a new "set-discount instance" shape (set title, percent, member
  line uuids + unit counts) exported alongside `SetDiscountStatus`.
- **UI:** `src/components/blocks/order/CheckoutForm.svelte`,
  `CheckoutItem.svelte`, `CheckoutDeals.svelte`, `SetPanel.svelte`,
  `ProductOrder.svelte` — basket-level instance list; remove per-line discount
  labels.
- **Submission:** `src/lib/orderSubmit.ts` — drop the per-item discount-source
  line; summarize set discounts at basket level.
- **Tests:** `src/lib/__tests__/setDiscount.test.ts` rewritten for the new
  semantics; hydration test unaffected in shape.
- No change to the TinaCMS `product_groups` content model (title, percent,
  member list) or to standalone product discounts.
