# ADR 0003: Set-discount model — percent per set, material-gated, per-unit greedy allocation

- **Status:** accepted (v2 — supersedes the pairwise/exact-match model of 2026-08-29)
- **Date:** 2026-09

## Context

Sets bundle different products at different base prices (e.g. a blanket + a
nest) with a single shared discount. Content is TinaCMS-managed and the schema
allows exactly one number per set (`discount_percent`) plus a member list.
Ordering is a quote request, so pricing must be explainable to a buyer, not
just computable. The site is static with a pure pricing core (ADR 0002), so
all of this resolves in one browser-side pass that a future backend can reuse.

The original model (2026-08-29) allocated discounts **pairwise** (one unit of
member A + one unit of member B) and gated matching on **exact** material
equality including count. That mis-modeled real sets: sets can have 3+
members, and members legitimately differ in how many fabrics they use (a
blanket uses one fabric, a nest uses two).

## Decision

1. **One percent per set, applied per member.** No flat "set price" (can't
   express different base prices), no per-member percents (content stays one
   number).
2. **Biggest percent wins, no stacking.** A product in several sets resolves
   to the single set with the largest `discount_percent`.
3. **Subset material matching (v2).** Two lines of different members count
   towards a set when the smaller material selection is a subset of the larger
   (every material id + colors present at least as often, compared
   order-independently). Material counts need not be equal; equal counts
   still require an exact match. Overlap-only matching was rejected: a
   blanket in a fabric the nest doesn't use must not match.
4. **Per-unit greedy allocation, biggest percent first (v2).** A set discount
   instance is one unit each of 2+ distinct members whose materials are
   **pairwise** compatible (subset containment is not transitive). Sets are
   processed by descending percent; for each, maximal instances are formed
   and repeated until fewer than 2 distinct members have units, consuming
   units globally (each unit at most once). Greedy, deterministic, and
   explainable; global money-optimal packing (min-cost matching/ILP) was
   rejected as unnecessary and opaque.
5. **One allocation, two consumers.** The single allocation returns both the
   per-line statuses (active / pending-partner / pending-material, with
   one-click material sync) and the ordered list of formed instances
   (`{ setTitle, percent, members: {uuid, count}[] }`). Pricing derives each
   line's discounted unit-fraction from the instances; the basket renders the
   instance list. Shown and charged discounts cannot diverge.
6. **Basket-level display (v2).** The checkout shows a "set discounts"
   section listing each formed instance; per-line discount labels were
   removed in favor of this grouped view.

## Consequences

- A set is on/off by existence in `product_groups`; there is no per-set date
  gating (standalone discounts remain date-gated via `discount_valid_until`).
- A second line of the same product is never a partner of the first; an item
  whose partners are all consumed reports `pending-partner` rather than a
  silently missing discount.
- Greedy ≠ optimal in contrived multi-set baskets (can cover fewer units than
  an optimal packing); accepted trade-off, pinned by tests so behavior is
  predictable.
- The set-discount percent is recorded raw in `DiscountInfo`
  (`discountSource: "set" | "standalone"` + `percent`) so the order email
  labels it without re-deriving the multiplier.
