# Design: add set support

## Context

See proposal.md for motivation. The pricing model and its rationale are
documented in [docs/set-pricing-model.md](../../docs/set-pricing-model.md);
this design records the technical decisions behind the implementation.
Open/cleanup items found in review are tracked in
[docs/set-support-followup-plan.md](../../docs/set-support-followup-plan.md).

Constraints: the site is static and build-time-first; client JS is limited to
Svelte islands; content is TinaCMS-managed (one number per set, nothing richer
in the schema than a percent and a membership list); ordering is a quote
request, so pricing must be explainable to a buyer, not just computable.

## Goals / Non-Goals

**Goals:**

- Model a set as content (one `discount_percent` per group, member list).
- Resolve which items earn a set discount given the *whole* basket, so the
  charged price and the displayed price can never disagree.
- Let buyers start an order from a product page and complete it at `/checkout`,
  with the basket persisting across pages and tabs.
- Keep standalone product discounts working for products not in any set.

**Non-Goals:**

- Per-set `valid_until` / date-gating of set discounts (a set is on/off by
  existence in `product_groups`).
- Sets whose members have different material structures (exact-match gating is
  the model; see set-pricing-model.md §6).
- Any change to how the order email is formatted beyond adding the discount
  source line.

## Decisions

### One percent per set, applied per member

A set carries a single `discount_percent` on the group — not per member and
not a flat "set price". A set bundles different products at different base
prices, so a flat price cannot express it; a percent keeps each item's price
independent and composable with field/material price parts, and content stays
one number per set.

### Biggest percent wins, no stacking

A product in several sets resolves to the single set with the largest
`discount_percent`; discounts never stack. Per-product max is the simplest
rule that is always optimal for that product under an additive percent model.

### Material-gated, globally allocated detection

Two members count towards a set only when their *normalized* selected material
values match exactly (order-independent; products without material selections
match trivially). Detection is **global**: `allocateSetDiscounts(basket, groups)`
resolves the whole basket in one pass — one set consumes one unit each of two
members of *different* products, and each basket unit is consumed at most once,
so a partner line covers no more sets than it has units. This tightens pricing
compared to per-item independence: a second line of the same product is not a
partner, and an item whose partners are all consumed reports `pending-partner`.

`resolveSetDiscountStatus` / `resolveActiveSetDiscount` are per-item lookups
into that one allocation — the single source of truth for both pricing and UI.

### Set discount replaces standalone, applied per allocated fraction

An item earns at most one discount source. When its active status allocates
`count` of its `count` units to a set, the total is reduced by
`percent * (count / count)` — i.e. the set percent applies to the allocated
fraction only. The standalone `product.discount` (date-gated) applies only when
no set discount is active. `DiscountInfo` records `discountSource: "set" |
"standalone"` so the UI and the email label it without re-deriving the percent.

### Shared live basket

`OrderBasket` (Svelte 5 `$state` class) reads/writes the same versioned
localStorage as before, plus: a `babasarok:basket-changed` window event so
islands with separate hydration roots stay in sync, and a `storage` listener
for cross-tab sync. Lines carry a `uuid`; adding a line that duplicates an
existing one (same product, fields, materials) merges counts into the survivor.

### Checkout page replaces the contact-page form

`/checkout` renders `CheckoutForm` (basket lines, deals summary, delivery,
contact details, submission) and the header shows a `NavBasket` count badge on
all other pages. The contact page keeps only contact info plus a link to
`/checkout`. Submission payload shape is unchanged (Web3Forms), except the
discount source line.

### Product-page configurator + deep links

Orderable product detail pages embed `ProductOrder` (sticky gallery +
configurator) beside the gallery. Set status UI (`SetPanel`, `SetSiblingCard`)
surfaces pending/active discounts, "add related" members, and one-click
material sync. `prefillFromParams` maps query params (field names, `count`,
`m<i>` material slots, embroidery colors) onto a fresh item so product pages
deep-link with preselected options.

## Risks / Trade-offs

- [Rule drift between pricing and UI] → mitigated: both read one allocation
  (`allocateSetDiscounts`); `setDiscount.test.ts` pins the behavior.
- [Tightened global pricing can surprise] (same-product line no longer a
  partner) → intended per set-pricing-model.md; surfaced via `pending-partner`
  status instead of a silently missing discount.
- [`prefillFromParams` suffix regexes] could misread a field literally named
  `*_color`/`*_custom_color` → follow-up: resolve by known embroidery field
  names or document reserved suffixes (followup plan §6).
- [Re-deriving the percent from the multiplier] in email/price display →
  follow-up: store the raw percent in `DiscountInfo` (followup plan §3).
- [Hardcoded Tailwind palette colors] in the new set UI → follow-up: replace
  with `@theme` tokens (followup plan §8).
