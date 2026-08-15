# Decision: set (product-group) pricing model

Status: **implemented** — pricing model plus material-gated set detection.

This documents _how_ sets affect pricing, including the **set detection** rule
in the basket (material-gated, non-exhaustive) — see the "Interaction with set
detection" section.

## 1. The decision

> **A set grants a percent discount, assigned per product.**
> Each product that participates in a set carries its own percent discount for
> that set. When a product in the basket belongs to **more than one** set, the
> product resolves to the **single set that yields the biggest discount for that
> product** — and only that set's discount is applied. Discounts never stack
> across sets.

Concretely:

- The unit of the discount is **percent** (0–100), not a flat amount, to stay
  consistent with the existing per-product `discount` field
  (see `src/lib/priceUtils.ts`, `discountMultiplier = 1 - product.discount / 100`).
- The discount is **scoped to a set**: a product's discount only applies _because
  it is in a set_, not because it is a product in general. (A product with no set
  keeps its existing standalone `discount` behaviour.)
- Resolution is **per product, independently**: for each basket item we find the
  best-discounting set that item is a member of and apply that one percent. We do
  _not_ pick one set "for the basket" and apply it uniformly.

## 2. Why this shape

- **Percent, per product** — a set is a bundle of _different_ products at
  _different_ base prices; a single flat "set price" (as the old Ovis Felszerelés
  hack tried to do, see issue #18) cannot express that. Percent-per-product keeps
  each item's price independent and composable with the existing field/material
  price parts.
- **Biggest-discount wins (no stacking)** — a product in two sets must not be
  discounted twice. Picking the max per product is the simplest rule that is
  also always optimal _for that product_ under an additive percent model, and it
  is easy to explain to a buyer ("you get the best deal you qualify for").
- **Per-product, not per-basket** — it degrades gracefully: if the buyer drops one
  set member, the _other_ products simply keep (or lose) their discount based on
  whatever sets they still qualify for. No single "set validity" boolean gates the
  whole basket.

## 3. Data model

The set itself is the `product_groups` collection added in PR #33
(`tina/collections/product-groups.ts`). The discount belongs **on the membership**,
i.e. on the `{ product, discount_percent }` entry inside a group — _not_ on the
product and _not_ as a single number on the group.

```
product_groups/*.md (frontmatter)
  title: Babafészek szett
  products:
    - product: src/content/product/babafeszek.md
      discount_percent: 10        # this product's discount *when it is in this set*
    - product: src/content/product/babatakaro-szett.md
      discount_percent: 15        # this product's discount *when it is in this set*
```

This keeps the `product` collection unchanged and makes "which set gives me which
discount" answerable per membership. (If we instead stored one `discount_percent`
on the group, every member would share it — a reasonable simplification, but it
loses the ability to discount the "lead" item of a set differently from its
accessories. **Decision: store it per membership.**)

## 4. Resolution algorithm (reference, to be implemented in `priceUtils.ts`)

For a given basket item `P` and the list of sets:

1. Collect the candidate sets = every set whose membership includes `P`.
2. If `P` is in no set → fall back to the existing standalone `product.discount`.
3. Otherwise pick the candidate set with the **largest** `discount_percent` for
   `P`; apply that percent as the multiplier `1 - discount_percent / 100`.
   - Tie-break on equal percents: pick the set with the **most members** in the
     basket, then the first in stable order. (Deterministic, cheap, and
     unobservable to the buyer.)
4. Do **not** combine the set discount with the standalone `product.discount`;
   the set discount _replaces_ it for that item (sets are the intended mechanism
   for the bundled deal).

> **Resolved (set detection):** a set is treated as **non-exhaustive** and
> **material-gated**. An item earns a set's discount as soon as it is in the
> basket _together with at least one other member of that same set whose
> selected material values match exactly_. Detection is implemented in
> `resolveActiveSetDiscount(item, basket, groups)`, which feeds the winning
> percent into `calculatePriceForItem`. The pure `resolveSetDiscount` remains
> for surfacing a product's _potential_ discount (the "add related" chips).

## 5. Relationship to existing pricing

- `calculatePriceForItem(product)` already ends with
  `totalPrice = unitPrice * count * discountMultiplier`. The set resolver simply
  feeds a _different_ `discountMultiplier` (from the winning set) into that same
  spot. Field/material price parts and length-based pricing are untouched.
- `discount_valid_until`: the standalone discount is date-gated. **Decision:**
  set discounts are **not** date-gated initially (a set is on/off by its
  existence in `product_groups`); add per-set `valid_until` later if needed.

## 6. Open questions (do not block the resolver)

1. **Different material counts** (issue #18) — the current match is _exact_: two
   products count towards a set only when their normalised material-value lists
   are identical. Members with different material counts (or a member with no
   materials paired with one that has them) therefore never match. Revisit if a
   set legitimately mixes products with differing material structures.
2. **UX surfacing** — should the applicable set discount be hinted at during
   material selection, or only revealed in the basket summary?
3. **Buyer-facing label** — when a set discount wins, do we show _"Szett
   kedvezmény"_ (distinct from the generic _"Kedvezmény"_) in the price breakdown? (already implemented)

## 7. Out of scope for this decision

- Any change to how the order email is formatted (`orderSubmit.ts`), unless we
  decide the email should show the set discount line.
