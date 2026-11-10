# Checkout redesign

The checkout becomes a multi-step wizard on the single `/checkout` page. This
is a **delta spec**: [order-submission.md](order-submission.md) and
[order-basket.md](order-basket.md) remain the behavioral authority; everything
they specify that is not changed here stays as written. When the redesign
ships, its scenarios fold into order-submission.md and this file is retired.

Visual references (in `checkout-design/`):

| File | Role |
| --- | --- |
| `desktop-multi-step-v2.png` | Desktop direction. Known delta: shows quantity steppers, removed by this spec. |
| `mobile-flow-v2.png` | Mobile direction; rendered with wrong aesthetics — `mobile-flow-v2-instructions.md` describes the final mobile screens on `multi-step-flow.png`'s visual base. |
| `address-form-details.png` | Structured address fields, billing states, input states. The focus-state example showing the house number inside the street field is wrong (see D5). |

## Roadmap placement

- **Epic 6 (native delivery methods)**: the step model, the structured
  address form, delivery-method cards, GLS parcel-shop support and carrier
  labels.
- **Epic 7 (Barion, tax, NAV invoicing)**: the Számlázás step, payment-method
  selection, the Barion redirect. The roadmap already scopes this: an
  optional separate billing address reusing epic 6's structured form.
- **Epic 8 (multi-language, merged)**: every new string is locale-keyed from
  the start; emails render per-locale from the epic-8 email tables.
- **Epic 9 (Slovakia)**: no currency or channel work here; the country field
  exists in the form from day one.

The checkout ships in epic 6 as a **3-step** wizard (Kapcsolat, Szállítás,
Áttekintés); epic 7 inserts **Számlázás** between Szállítás and Áttekintés.
The step list is data, and the progress strip renders from it — inserting a
step is a list change, not a redesign.

## Decisions

**D1 — Multi-step wizard on one page.** One step's form is visible at a time;
completed steps collapse to a one-line summary with a `Módosítás` link; a
progress strip shows all steps (completed ✓ / active / upcoming). Mobile:
sticky bottom bar with the total, expanding to the full summary; desktop:
sticky order-summary column.

**D2 — Payment is not a form step.** Payment happens as the outcome of the
Áttekintés submit. In epic 6 the submit transitions to `ArrangingPayment` as
today (manual settlement by the owner, epic 5). In epic 7 the submit routes
by payment method: Barion → redirect to the Barion gateway and back to a
confirmation state; manual transfer → the current flow (order placed, owner
settles); utánvét → pay on delivery, nothing online. The progress strip
covers form steps only; "Fizetés" is a post-submit state, not step 5.

**D3 — Persistence stays as order-submission.md specifies.** Every step's
"Tovább" writes its fields onto the active order (the same mutations, the
same save-on-blur/pause, the same pre-fill on load, the same
save-failure-does-not-block rule). The only new client state is the step
index, synced to the URL hash: browser back = previous step, refresh lands
on the saved step, and the saved step is derived from what the order already
has when the hash is absent or ahead of the data.

**D4 — Quantity is display-only.** Checkout lines show `N db` text. Quantity
and configuration changes happen only through the `Szerkesztés` deep link
into the product-page configurator (`?line=`, which supports quantity);
removal stays in checkout. The checkout stops calling `adjustOrderLine`.

**D5 — Structured delivery address (epic 6).** The single free-text address
field becomes: `Utca` (wide) + `Házszám` (narrow) on one row, `Irányítószám`
(narrow) + `Város` (wide) on one row, `Ország` dropdown. House number is its
own field everywhere (carrier labels need it separately; it is never typed
into the street field). Labels sit above inputs; long labels wrap, never
truncate.

**D6 — Billing address (epic 7).** A toggle `Azonos a szállítási címmel`
(default on). Off reveals the **same field shape** as the delivery address —
it is not a company form. Company data is a separate optional group
(`Cégnév`, `Adószám`) shown for both toggle states, stored with the order's
native billing address (`setOrderBillingAddress`, company in the address's
`company` field; the tax number as an order custom field).

**D7 — Sets render as chips, not brackets.** One chip row per **set** (never
per instance): `Baba alapszett · 2 példány · −4 000 Ft` — instance count and
clamped discount come from the order's own computed data
(`Order.setDiscounts` / `OrderLine.setState`). Hover/focus on the chip rings
the member cards. A line can carry several set badges. An incomplete set
shows no discount chip in the totals area: the line keeps its action chip
(`Anyag szinkronizálása` / partner links) and the set chip renders muted
(`még nem teljes`).

**D8 — Exactly one submit affordance.** The order-summary panel shows no
submit button before the Áttekintés step (a muted hint instead). The
Áttekintés step carries the terms checkbox and the CTA; its label follows
D2's routing when epic 7 lands.

## Step → mutation contract

| Step | Mutations (on Tovább and on edit-save) | Epic |
| --- | --- | --- |
| Kapcsolat | `setCustomerForOrder` (name, email, phone) | S5, unchanged |
| Szállítás | `setOrderShippingMethod`; `setOrderShippingAddress` (structured) — skipped when the method needs no address | epic 6 |
| Számlázás | `setOrderBillingAddress`; order custom field for the tax number | epic 7 |
| Áttekintés | `setOrderCustomFields` (`message`, `termsAccepted`, `submissionTransactionId`); `transitionOrderToState("ArrangingPayment")` | S5 unchanged; the post-transition branch becomes payment-routing in epic 7 |

The backend transition guard ("Order validation" in order-submission.md)
keeps every existing rule; the `streetLine1` non-empty check becomes the
structured-fields check (street, house number, postcode, city non-empty when
the method requires an address).

## Step validation and downstream invalidation

Each step's Tovább runs only that step's checks (the current global blocker
list splits per step); the server-side validation is unchanged and still
authoritative.

| Editing… | Effect |
| --- | --- |
| Kapcsolat fields | none downstream |
| Delivery method → `Személyes átvétel` | the address section hides (`requiresAddress` false, as readiness does today); a saved address is kept but not required |
| Delivery method → an address method | the address section shows; previously saved address pre-fills |
| Address country | re-fetch `eligibleShippingMethods`; if the selected method is no longer eligible, its selection clears and the wizard stays on the step |
| Any address/method change | the summary re-renders from the order — the shown-equals-charged invariant (one-pass basket pricing) is unchanged |

## Scenarios

- **Scenario: Refresh mid-checkout**
  - WHEN a buyer who reached the Szállítás step reloads the page
  - THEN the wizard opens on the Szállítás step, its fields pre-filled from
    the active order, and completed steps collapsed to their summaries
- **Scenario: Browser back**
  - WHEN the buyer presses browser back on the Számlázás step
  - THEN the wizard returns to the Szállítás step with saved values, not off
    the checkout page
- **Scenario: Method switched to pickup**
  - WHEN the buyer selects `Személyes átvétel` after entering an address
  - THEN the address section hides, the address stays saved, and Áttekintés
    remains reachable without re-entering it
- **Scenario: Quantity edit**
  - WHEN the buyer wants a second piece of a line
  - THEN the line offers `Szerkesztés` into the product-page configurator
    with the line pre-loaded; checkout shows the updated quantity and price
    when they return
- **Scenario: Billing step absent (epic 6)**
  - WHEN the checkout runs before epic 7
  - THEN the wizard has three steps and no billing UI; placed orders carry no
    billing address, as today
- **Scenario: Barion path (epic 7)**
  - WHEN the buyer submits with Barion selected
  - THEN the order transitions to `ArrangingPayment`, the buyer is redirected
    to Barion, and the return lands on a confirmation/failure state; back
    navigation after payment shows the placed order read-only, never the form

## Preserved unchanged

Per-line `invalidReason` and price-change alerts; stale-page UX; pre-fill
from the active order and the never-in-browser rule for contact data; the
free-delivery promotion display; conversion tracking and `/client-errors`
reporting; the legacy-orders dashboard display; the contact page rule.

## Open questions (owner decisions)

1. **House-number storage** (epic 6): a native address column via
   `streetLine2` with a documented convention, or an order/address custom
   field. Epic 6's roadmap note lists postcode/city/street/country but not
   the house number, which the GLS label needs separately.
2. **Parcel-shop delivery** (epic 6): is the GLS ParcelShop picker (MyGLS
   lookup, pickup-point replaces the address, a `requiresPickupPoint`-style
   method custom field) in epic 6's scope or a follow-up?
3. **Payment-method selection placement** (epic 7): a method-conditional
   section inside the Szállítás step (payment eligibility depends on the
   delivery method: utánvét is cash-only) versus a compact selector on
   Áttekintés. Recommendation: inside Szállítás, second group, so Áttekintés
   stays a pure review.
4. **Barion return states** (epic 7): confirmation URL, failure/retry
   surface, and what the owner's manual-transfer flow keeps alongside Barion
   for the `előre utalás` method.
5. **Invoicing provider** (epic 7): Számlázz.hu Agent vs direct NAV
   integration — depends on the owner's accountant answers (OSS/VAT status);
   affects whether confirmation emails attach an invoice PDF.
