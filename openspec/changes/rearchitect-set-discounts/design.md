## Context

See proposal.md — Why. The current implementation lives in
`src/lib/priceUtils.ts`: `normalizeMaterialValues`/`materialsMatch` (exact,
count-equal), `allocateSetDiscounts` (pairwise `allocatePool` over
material-keyed pools), and per-item `resolveSetDiscountStatus` /
`resolveActiveSetDiscount` lookups consumed by the order islands and
`orderSubmit.ts`. `setDiscount.test.ts` pins the old pairwise semantics.

Constraints unchanged from the original set design: static, build-time-first
site with Svelte islands; TinaCMS `product_groups` content is one number
(`discount_percent`) plus a member list; ordering is a quote request, so pricing
must be explainable to a buyer. The pure core boundary proposed by
`extract-pricing-core` is compatible with this change — the new logic stays
dependency-free and browser/server-shareable.

## Goals / Non-Goals

**Goals:**

- Model the set discount as a per-**unit**, maximal **instance** allocation with
  subset material matching, resolved in one global pass that drives both price
  and display.
- Emit the formed **instances** (set, percent, member line uuids + unit counts)
  as first-class output so the basket can render "which lines form which set".
- Preserve standalone discounts, deep links, candidate suggestions, and the
  pending-partner / pending-material nudges.

**Non-Goals:**

- Global money-optimal packing. Per user decision, allocation is greedy
  (biggest percent first) with maximal-then-repeat instances; it does **not**
  split a maximal instance to cover an extra leftover unit.
- Changing the CMS content model, standalone discount rules, or the Web3Forms
  submission shape beyond removing the per-item discount-source line.
- Per-set date gating or mixed-material-structure heuristics beyond the subset
  rule.

## Decisions

### Subset material matching replaces exact equality

`materialsMatch(a, b)` becomes directional-agnostic subset containment: normalize
each product's selected material values (drop empty/`error`, sort colors, sort by
`material_id`) into a `Map<material_id, {colors, custom_color}>`, then the pair
is compatible when the smaller map is contained in the larger (every entry
present with identical colors + custom color). Equal-size maps reduce to the old
exact match, so existing equal-count cases are preserved. A helper
`materialsSubset(small, large)` expresses containment; `materialsMatch` is
`subset(a,b) || subset(b,a)`.

_Alternative considered_ (overlap-only): rejected per user answer — a blanket in
a fabric the nest doesn't use should not match.

### Instance membership is pairwise-compatible

Subset containment is **not transitive** (A⊆C and B⊆C does not imply A and B
match). An instance therefore requires all members to be **pairwise** compatible.
In practice this means the members form a subset chain (there is one "largest"
selection containing the rest). Sets are small (2–3 members), so a straightforward
pairwise check when growing an instance is sufficient and clear; no clustering
algorithm is warranted.

### Per-unit greedy allocation, biggest percent first

`allocateSetDiscounts(basket, groups)` expands lines into per-unit slots (or
tracks a remaining-count per line) and processes sets sorted by
`discount_percent` descending (tie-break: group order, then basket order). For
each set it repeatedly builds a **maximal instance**: pick, in basket order, at
most one still-available unit from each distinct member product such that the
chosen units are pairwise compatible, seeded by the first available unit. Form
the instance when ≥2 distinct members are covered; mark those units consumed;
repeat until fewer than 2 distinct members have available units. A unit consumed
by a higher-percent set is unavailable to lower-percent sets — this yields
"biggest percent per unit first" and the count-2-across-two-sets caveat for free.

_Alternative considered_ (min-cost matching / ILP for global optimum): rejected
per user answer and to keep pricing explainable and deterministic.

### One allocation, two consumers, new instance output

The function returns both the per-item `SetDiscountStatus` map (for pending
hints, unchanged consumers) **and** an ordered list of formed instances:
`{ setTitle, percent, members: { uuid, count }[] }`. Pricing
(`calculatePriceForItem` / `resolveActiveSetDiscount(s)`) derives each line's
discounted unit-fraction from the instances; the basket UI renders the instance
list directly. Both read the single allocation, so shown and charged discounts
cannot diverge (the invariant the old design also held).

### UI: basket-level instance list; drop per-line labels

`CheckoutForm` computes instances once and renders a new "set discounts" section
(each instance: title, `-percent%`, member line chips with unit counts).
`CheckoutItem` loses its per-line discount label; `CheckoutDeals` is refocused on
pending opportunities + the active instance list. `SetPanel`/`ProductOrder` keep
candidate "add related" + pending-partner/pending-material sync, re-expressed
against instances. `orderSubmit.ts` replaces the per-item source line with a
basket-level set-discount summary.

## Risks / Trade-offs

- [Greedy ≠ optimal] A biggest-percent-first greedy can, in contrived multi-set
  baskets, cover fewer total units than an optimal packing → accepted per user
  decision; documented and covered by tests so behavior is predictable.
- [Non-transitive subset in ≥3-member instances] pairwise growth could depend on
  seed order → mitigated by deterministic basket-order iteration and tests; sets
  are small so the effect is negligible.
- [Rule drift between price and UI] → mitigated: one allocation feeds both;
  `setDiscount.test.ts` (rewritten) pins instances, pricing, and statuses
  together.
- [Consumers expecting old per-line labels] → the removed per-line label and
  submit source line are intentional; update all order islands and the email
  formatter in the same change to avoid a half-migrated UI.
