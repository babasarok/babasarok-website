# Commerce platform evaluation → shortlist: Vendure vs Medusa

Status: **exploration / narrowing.** Captures the reasoning from the migration
discussion so it isn't lost. Shortlist: **two self-hosted OSS Node backends —
Vendure (leaning) and Medusa (fallback)** (§6). The SaaS-checkout options
(Shopify, Foxy, Snipcart) are parked, mainly because they can't cleanly take
Barion (§7). Next step: **spike both backends** against our configurator (§8).
The one committed prep item is the pricing-core refactor
(`openspec/changes/extract-pricing-core/`, §9).

## 1. The core constraint: we are CPQ, not a SKU catalog

Our products are **made-to-order / configure-price-quote**, not a fixed SKU
catalog:

- Dynamic `fields[]` (input/select/radio/color/toggle/embroidery) with
  `depends_on` chains (`tina/collections/product.ts`).
- Additive pricing: base + per-option prices + per-material prices.
- Free-form inputs: embroidery **text** (priced per word), **custom** colors
  (free hex), **per-meter** length pricing — all unbounded.
- Materials: 2-N slots, dynamic color counts, banned combinations.
- Material-gated, globally-allocated **set discounts**
  (`src/lib/priceUtils.ts`).

Consequence: **we cannot enumerate configurations as variants.** Any platform
must represent a configured item as a **custom-priced line item** (config in
line-item metadata; `unit_price` computed by our pricing engine). Variants, if
used at all, cover only small bounded structural choices (e.g. size).

Catalog size is tiny (~15 orderable products, 9 materials) — scaling is a
**modeling** problem, not a data-volume one.

## 2. Cloudflare Workers constraint

- **Medusa v2 does NOT run on CF Workers** — long-running Node app needing
  Postgres + Redis + a workflow engine. Host on Railway/Fly/Render/VPS.
- **Vendure** (Node/GraphQL/Postgres) and **Saleor** (Python/Django) — same:
  not edge/Workers-native.
- Only a hand-rolled Worker + Stripe + D1 is truly CF-self-hostable — but at
  international scale (§3) that stops being "thin".

If "self-host on CF Workers" were a hard requirement, no real commerce platform
qualifies. The international requirements (§3) outweigh that goal.

## 3. Requirement pivot: domestic vs. international

Early advice assumed **low-volume domestic**, where the cheapest path is: keep
today's Web3Forms email + Stripe Dashboard as the only "admin," build almost
nothing. That no longer holds.

**Actual target: international rollout where manual email/payment/address
handling is NOT acceptable.** That flips the recommendation toward a real
platform, because you inherit:

- **Tax:** EU **VAT + OSS** (destination rates, thresholds), VAT-ID validation,
  and mandatory **Hungarian NAV Online Számla** invoice reporting (legal, per
  invoice).
- **Payments:** automated capture, SCA/3DS, multi-currency, per-market methods.
- **Address validation across countries:** a HU 4-digit postcode regex does not
  generalize; deliverability needs Google Address Validation / carrier APIs.
- **Shipping/fulfillment:** GLS doesn't cover every destination → multi-carrier,
  rate shopping, label + tracking automation.
- **Order ops:** status, returns, refunds, notifications — automated.

Building all of that on a custom Worker = reinventing a commerce platform and
owning every seam (violates our _standardised over bespoke_ value).

## 4. Admin UI: what we do and don't build

- **Catalog/pricing authoring** → stays in **TinaCMS** (free).
- **Payments/refunds/receipts** → **Stripe Dashboard** (or platform admin).
- **Inventory** → none (made-to-order).
- The only real gap is **order operations**; a platform gives this out of the
  box. That built-in admin is Vendure/Medusa's main advantage over a custom
  Worker.

## 5. Candidate survey (why the shortlist is Vendure + Medusa)

No mainstream backend markets itself as "CPQ-native," but several expose the one
capability we need: a first-class hook for _server-authoritative custom
line-item pricing from arbitrary configuration + validation_. Ranked by CPQ fit:

| Backend                         | CPQ mechanism                                                                                            | Self-host?          | CF-friendly            | Notes                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| **Vendure** (OSS, Node)         | `OrderItemPriceCalculationStrategy` + custom order-line fields; documented configurable-products pattern | Yes (Node+DB)       | Backend not on Workers | **Best structural fit** in OSS: config lives on the order line, our engine sets the price. |
| **Foxy.io** (SaaS checkout)     | Needs **no catalog** — arbitrary products + per-option price modifiers + **HMAC** cart validation        | SaaS                | Yes (overlay)          | Closest to "CPQ checkout off the shelf," but can't take Barion.                            |
| **Medusa** (OSS, Node)          | Custom line items with `metadata` + custom `unit_price`; modules/workflows                               | Yes (Node+PG+Redis) | Backend not on Workers | Toolkit, not a hook — we wire the CPQ flow (logic already exists). Max flexibility.        |
| **Snipcart** (SaaS checkout)    | Custom fields per product + **webhook price validation**                                                 | SaaS                | Yes                    | Lighter than Foxy, but can't take Barion.                                                  |
| **Shopify + options/perso app** | Line-item properties + **Shopify Functions** (custom price) via Kickflip / Zakeke / Bold                 | SaaS                | Yes                    | Extra SaaS dependency; Barion not an accepted gateway.                                     |
| **commercetools**               | External prices + custom line items                                                                      | SaaS (enterprise)   | Yes                    | Enterprise cost/complexity — overkill.                                                     |

Dedicated B2B CPQ engines (Salesforce CPQ, Tacton, Threekit, Configit) are
enterprise and not DTC-checkout oriented — out of scope.

That leaves two finalists:

- **SaaS (Foxy, Snipcart, Shopify): parked** — none can cleanly take Barion,
  our required domestic payment rail (§7).
- **OSS (Vendure, Medusa): shortlisted** — self-hosted, full data ownership,
  and both can plug in Barion + Stripe Tax (§7).

In every option our **extracted pricing core is the authority** — another
reason `extract-pricing-core` is the right first move regardless of winner.

## 6. Why Vendure is the front-runner (current lean)

Both finalists run Node + Postgres off Cloudflare (Medusa also wants Redis),
give us full data ownership, and let Barion + Stripe Tax plug in. The
tiebreaker is **configurator fit**:

- **Vendure** exposes a first-class `OrderItemPriceCalculationStrategy` hook and
  custom order-line fields, so a configured line's price comes straight from our
  extracted pricing core — the exact CPQ seam we need.
- **Medusa** is a flexible toolkit where we wire the same flow by hand via
  custom line items + `metadata`.

Vendure = the hook already exists; Medusa = we build the hook.

**Set-discount fit (verified against Vendure sources):** the material-gated,
globally-allocated set discount (§1) is **expressible in Vendure's promotion
model**, but not with built-in conditions/actions — it needs a small custom
promotion plugin, which is a first-class documented extension point (no fork):

- A custom `PromotionCondition` (`check(ctx, order, args)`) reads the config
  from `orderLine.customFields`, runs the extracted pricing core over all lines,
  and returns a **state object** `{ [lineId]: { count, percent, setTitle } }`
  (the documented condition→action "state" pattern, used by built-in buy-X-get-Y).
- A custom `PromotionLineAction` (`execute(ctx, orderLine, args, state)`) reads
  that state and returns an arbitrary **line-total** discount
  (`-unitPrice × covered × percent / 100`), which collapses to our exact formula
  (`src/lib/priceUtils.ts`).
- **Must use `PromotionLineAction`, not `PromotionItemAction`:** the latter's
  return is a _per-unit_ amount the core multiplies by `orderLine.quantity`, so
  it can only discount a whole line uniformly — wrong for partial per-unit
  coverage (2 of 3 units). The line action takes the raw line-total.

Caveats to prove in the spike (§8): (1) money totals are exact, but a partially
covered line shows a prorated per-unit discount price — the "2 of 3 in set"
messaging must come from the line's customFields, not Vendure; (2) we round the
final total vs. Vendure rounding the discount via `roundMoney` — verify against
the Vitest suite; (3) `OrderCalculator` applies promotions before tax and
re-runs the tax strategy on change, so VAT lands on the discounted amount (good);
(4) the condition needs the set-group definitions (TinaCMS groups) — via
promotion args, a DB table, or product custom fields.

**Medusa is the fallback** if, in the spike, this condition + line-action
implementation proves less clean than Medusa's equivalent wiring.

## 7. Payments and tax: Barion + Stripe Tax

**Payment and tax are independent — don't conflate them.** Barion only _charges
the total our backend computed_; it is not a tax engine. So we mix **Barion for
payments + Stripe Tax for VAT** with no coupling.

**Stripe Tax works without Stripe payments.** Its **Standalone Tax API** (`POST
/v1/tax/calculations`) is explicitly documented for "off-Stripe / non-Stripe
gateways." Per order: (1) our core computes line prices; (2) call
`tax/calculations` with amounts + address → VAT per line (EU destination rates,
OSS, VAT-ID reverse-charge via `tax_ids`, tax-inclusive pricing); (3) Barion
charges the tax-inclusive total; (4) record a Stripe tax transaction + issue the
invoice. In Vendure this is a `TaxLineCalculationStrategy`; in Medusa a custom
tax provider. Barion is a separate `PaymentMethodHandler` / payment module.

Caveats:

- Stripe Tax only returns tax where you hold an **active registration** — you
  still register and remit per jurisdiction.
- **Stripe Tax ≠ invoicing:** HU **NAV Online Számla** reporting stays mandatory
  and separate (Számlázz.hu / Billingo). Alternatives to Stripe Tax: Fonoa,
  Vertex, Avalara, or hard-coded EU rates for a small country set.

**Barion itself** is a Hungarian, EU-licensed (PSD2) institution (cards +
wallet, SCA/3DS, multi-currency) with a REST API + PHP/iOS/Android libs; it
drops into Vendure/Medusa as a custom payment provider (Barion ships an official
WooCommerce plugin as precedent). It is **not** on Shopify's approved gateways
(no Shopify Payments in HU) nor Foxy/Snipcart's fixed lists — which is why those
were parked.

## 8. Spike plan (do this before committing)

The whole risk is **configurator ↔ platform fit** (and, given Barion,
**payment-provider fit**). Prove it on the two shortlisted backends by adding a
fully-configured `babafeszek` (2 materials + colors + per-word embroidery, with
an active **set discount**) to a cart as a **correctly-priced, correctly-taxed
line item**:

- **Vendure:** config in custom order-line fields; price via
  `OrderItemPriceCalculationStrategy` from our core; set discount via a custom
  `PromotionCondition` (core over all lines → state) + `PromotionLineAction`
  (line-total discount) per §6; Stripe Standalone Tax API for VAT; confirm
  Barion integration via its API.
- **Medusa:** custom line item with our computed `unit_price` + config in
  `metadata`; set discount via a promotion or custom module; Barion payment
  module; Stripe Standalone Tax API for VAT.

Success = the charged total, the VAT, the human-readable order lines, **and a
completed Barion payment** match what `src/lib/priceUtils.ts` + `orderSubmit.ts`
produce today. Whichever spike is less painful wins — that single experiment
beats more planning (win criterion per §6).

## 9. Dependency: pricing-core refactor (committed)

Both spikes need our pricing/validation logic runnable **outside the browser**.
Tracked separately as `openspec/changes/extract-pricing-core/`: extract
`priceUtils` / `validation` / field & material helpers / domain types into a
pure, dependency-free, tested core (no Svelte runes / DOM / Astro imports) so the
browser (display) and the platform (authoritative price + VAT base) share one
implementation. Behavior-preserving; the Vitest suite is the safety net.

## 10. Address validation (tiered, platform-agnostic)

- Gate on the delivery method's `needs_address` flag (pickup collects nothing).
- Tier 1: free-text + required + HU postcode `^\d{4}$` in the pure core (runs
  client + server). Improvement over today's zero validation.
- Tier 2: Stripe Checkout / platform-native shipping-address collection
  (country-restricted, autocomplete + format validation) — removes UI.
- Tier 3: carrier/Google Address Validation API or GLS parcel-shop picker — only
  if misdelivery cost or parcel-shop delivery demands it.

## 11. Decisions (2026-08-29)

- **Storefront/checkout stays ours.** The Astro site + Svelte configurator
  remain the storefront; the platform is an API-only backend (cart/order/
  payments/admin). Neither finalist ships a checkout usable for our CPQ
  configurator anyway (Medusa's is a Next.js starter; Vendure has no official
  storefront), so adopting one would mean rebuilding the configurator on a
  foreign stack for no gain. The platform's job is exactly the §4 gap: order
  ops + payments + admin. Consequence for the spike (§8): we integrate via the
  platform's Shop API, not a hosted checkout.
- **Multi-currency: per-market static prices, not FX conversion.** Each market
  has its own price list; no runtime currency conversion. Consequences:
  - The pricing core stays the authority (§5), but its price *data* becomes
    per-market: every additive component (base, per-option, per-material,
    per-word embroidery, per-meter) needs a price per market, authored in
    TinaCMS.
  - `extract-pricing-core` (§9) must account for a market/price-list dimension
    in its inputs — the core computes from a given market's price list.
  - Per-market display rounding (e.g. HUF 0-decimal, EUR 2) is part of the
    core contract.
  - Per-market margins become possible (the point of this choice).

## 12. Open questions (answer before the full plan)

1. **Per-market price authoring model** (follows from §11): how does TinaCMS
   store per-market components (per-product price-list fields? a market
   collection?), how does the core receive "the active market's price list",
   and what's the fallback when a market lacks a price (hide product? fall back
   to HUF?).
2. **Set-group data location** (§6 caveat 4): promotion args vs. DB table vs.
   product custom fields.
3. **Hosting target** (§2): Railway/Fly/Render/VPS — none chosen; includes ops
   cost for a platform we don't get for free like TinaCMS.
4. **Invoicing vendor** (§7): Számlázz.hu vs. Billingo for NAV Online Számla.
5. **Tax/OSS registrations** (§7): per-jurisdiction VAT registrations are an
   operational prerequisite gating each market's go-live, independent of the
   platform.
6. **Payments/refunds admin surface** (§4): Stripe Dashboard vs. platform
   admin.
7. **Transactional email** provider for automated order ops (§3).
8. **Address-validation Tier 3 trigger** (§10): what misdelivery cost /
   parcel-shop demand justifies carrier/Google validation.
