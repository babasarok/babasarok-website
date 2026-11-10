# Mobile checkout flow — delta instructions

Base: `multi-step-flow.png` (v1) — keep its visual style, layout, spacing,
typography, header and illustrations unchanged. Apply only the deltas below.
The result replaces `mobile-flow-v2.png` (which got the content right but the
rendering wrong).

## Screen 1 — Kapcsolat

Unchanged.

## Screen 2 — Szállítás

1. Three radio cards, in this order (v1 dropped one):
   - "GLS házhozszállítás – előre utalással · 2 500 Ft" — selected
   - "GLS házhozszállítás – utánvét · 3 500 Ft"
   - "Személyes átvétel Telkibányán · ingyenes"
2. Address fields unchanged (Utca; Házszám + Irányítószám pair; Város;
   Ország dropdown), labels above inputs.
3. Small grey note under the address group: "Az adataid automatikusan
   mentődnek, később is folytathatod."

## Screen 3 — Számlázás

1. Toggle "Azonos a szállítási címmel" OFF reveals billing fields in the
   SAME shape as the delivery address: Név, Utca, Házszám + Irányítószám,
   Város. It is not a company form.
2. Company data is a separate muted optional group at the bottom: label
   "Cégnév és adószám (vállalkozásoknak, opcionális)" with two fields
   (Cégnév; Adószám). Never a single placeholder-only field.

## Screen 4 — Áttekintés (the main fix)

1. Product cards, v1 styling with v2 content:
   - thumbnail left; product name; config line "Anyag: … · Méret: …"
     (the `describeLine` rows); display-only quantity "1 db" — NO steppers;
     price right-aligned.
   - card footer: "Szerkesztés" pencil link (deep link to the product-page
     configurator, `?line=`) + trash icon. Quantity changes happen only
     through the configurator; the edit path supports quantity.
2. Sets — chip treatment, no bracket:
   - each member card carries a small badge chip with the set name
     ("Baba alapszett");
   - one chip row below the member cards: tag icon +
     "Baba alapszett · 1 példány · −2 000 Ft" — one chip per SET, never per
     instance; instance count × clamped per-instance discount;
   - hover/focus on the chip highlights (rings) the member cards;
   - incomplete set: the line carries the warning action chip
     ("Anyag szinkronizálása" / partner links) and the set chip renders
     muted as "még nem teljes" with no discount shown.
3. Totals: Részösszeg (discount applied), Szállítás, bold Összesen;
   terms checkbox; "Rendelés elküldése".
4. Review-screen edit affordance: per-block "Módosítás" links next to
   Kapcsolat / Szállítás / Számlázás summaries (stepper jump is secondary).

## Global rules

- Quantity is display-only on every screen (steppers removed).
- Exactly one submit affordance: the Áttekintés CTA. No submit button in
  any summary before step 4.
- Hungarian labels; long labels wrap, never truncate.
- Step state syncs to the URL hash; browser back = previous step.
