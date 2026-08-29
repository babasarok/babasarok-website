# Commerce platform evaluation → shortlist: Vendure vs Medusa

Status: **exploration / narrowing.** Captures the reasoning from the migration
discussion so it isn't lost. **Shortlist reduced to two self-hosted OSS Node
backends: Vendure and Medusa — currently leaning Vendure** (see below). The
SaaS-checkout options (Shopify, Foxy, Snipcart) are parked, mainly because they
can't cleanly take Barion (§6). Next step: **spike Vendure and Medusa** against
our configurator (§7). The one committed prep item is the pricing-core refactor
tracked in `openspec/changes/extract-pricing-core/`.

## Why Vendure over Medusa (current lean)

Both run Node + Postgres (Medusa also wants Redis) off Cloudflare, both give us
full data ownership and let Barion + Stripe Tax plug in. The tiebreaker is
**configurator fit**: Vendure exposes a first-class
`OrderItemPriceCalculationStrategy` hook and custom order-line fields, so a
configured line's price comes straight from our extracted pricing core — the
exact CPQ seam we need. Medusa is a flexible toolkit where we wire the same flow
by hand via custom line items + `metadata`. Vendure = the hook already exists;
Medusa = we build the hook. Medusa stays as the fallback if Vendure's promotion
model can't express the material-gated set discount cleanly.

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
- Only a hand-rolled Worker + Stripe + D1 is truly CF-self-hostable — but see
  §4, that stops being "thin" at international scale.

If "self-host on CF Workers" were a hard requirement, no real commerce platform
qualifies. The international requirements (§4) outweigh that goal.

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

| Backend                          | CPQ mechanism                                                                                | Self-host? | CF-friendly          | Notes                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ---------- | -------------------- | ------------------------------------------------------------------------------ |
| **Vendure** (OSS, Node)          | `OrderItemPriceCalculationStrategy` + custom order-line fields; documented configurable-products pattern | Yes (Node+DB) | Backend not on Workers | **Best structural fit** in OSS: config lives on the order line, our engine sets the price. |
| **Foxy.io** (SaaS checkout)      | Needs **no catalog** — arbitrary products + per-option price modifiers + **HMAC** cart validation | SaaS       | Yes (overlay)        | Closest to "CPQ checkout off the shelf," but can't take Barion.                |
| **Medusa** (OSS, Node)           | Custom line items with `metadata` + custom `unit_price`; modules/workflows                   | Yes (Node+PG+Redis) | Backend not on Workers | Toolkit, not a hook — we wire the CPQ flow (logic already exists). Max flexibility. |
| **Snipcart** (SaaS checkout)     | Custom fields per product + **webhook price validation**                                     | SaaS       | Yes                  | Lighter than Foxy, but can't take Barion.                                      |
| **Shopify + options/perso app**  | Line-item properties + **Shopify Functions** (custom price) via Kickflip / Zakeke / Bold     | SaaS       | Yes                  | Extra SaaS dependency; Barion not an accepted gateway.                         |
| **commercetools**                | External prices + custom line items                                                          | SaaS (enterprise) | Yes           | Enterprise cost/complexity — overkill.                                         |

Dedicated B2B CPQ engines (Salesforce CPQ, Tacton, Threekit, Configit) are
enterprise and not DTC-checkout oriented — out of scope.

The SaaS options (Foxy, Snipcart, Shopify) are parked mainly because they can't
cleanly take Barion (§6), which leaves the two self-hosted OSS backends,
**Vendure** and **Medusa** (compared at the top of this doc). In every option
our **extracted pricing core is the authority** — another reason
`extract-pricing-core` is the right first move regardless of winner.

## 6. Payments and tax: Barion + Stripe Tax

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
wallet, SCA/3DS, multi-currency) with a REST API + PHP/iOS/Android libs; it drops
into Vendure/Medusa as a custom payment provider (Barion ships an official
WooCommerce plugin as precedent). It is **not** on Shopify's approved gateways
(no Shopify Payments in HU) nor Foxy/Snipcart's fixed lists — which is why those
were parked.

## 7. Spike plan (do this before committing)

The whole risk is **configurator ↔ platform fit** (and, given Barion,
**payment-provider fit**). Prove it on the two shortlisted backends,
**Vendure and Medusa**:

Add a fully-configured `babafeszek` (2 materials + colors + per-word embroidery

- an active **set discount**) to a cart as a **correctly-priced, correctly-taxed
  line item**, on each candidate:

- **Vendure spike:** custom order-line fields for the config +
  `OrderItemPriceCalculationStrategy` computing price from our core; set discount
  via promotion/custom logic; Stripe Standalone Tax API for VAT; confirm Barion
  integration via its API.
- **Medusa spike:** custom line item with our computed `unit_price` + config in
  `metadata`; set discount via a promotion or custom module; Barion payment
  module; Stripe Standalone Tax API for VAT.

Success = the charged total, the VAT, the human-readable order lines, **and a
completed Barion payment** match what `src/lib/priceUtils.ts` + `orderSubmit.ts`
produce today. Whichever spike is less painful wins; that single experiment
beats more planning. Vendure is the front-runner — if its
`OrderItemPriceCalculationStrategy` + promotion model handle the configured
price and the material-gated set discount cleanly, it wins; fall back to Medusa
if they don't.

## 8. Dependency: pricing-core refactor (committed)

Both spikes need our pricing/validation logic runnable **outside the browser**.
Tracked separately as `openspec/changes/extract-pricing-core/`: extract
`priceUtils` / `validation` / field & material helpers / domain types into a
pure, dependency-free, tested core (no Svelte runes / DOM / Astro imports) so the
browser (display) and the platform (authoritative price + VAT base) share one
implementation. Behavior-preserving; the Vitest suite is the safety net.

## 9. Address validation (tiered, platform-agnostic)

- Gate on the delivery method's `needs_address` flag (pickup collects nothing).
- Tier 1: free-text + required + HU postcode `^\d{4}$` in the pure core (runs
  client + server). Improvement over today's zero validation.
- Tier 2: Stripe Checkout / platform-native shipping-address collection
  (country-restricted, autocomplete + format validation) — removes UI.
- Tier 3: carrier/Google Address Validation API or GLS parcel-shop picker — only
  if misdelivery cost or parcel-shop delivery demands it.
