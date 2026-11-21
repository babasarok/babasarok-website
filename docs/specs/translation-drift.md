# Translation drift

Surfaces catalog translation health on a dashboard page ("Fordítások" under
the catalog navigation): text with no English value, and Hungarian text that
changed after its English counterpart was last touched. Hungarian (`hu`) is
the source language ([catalog translations](../agents/catalog-translations.md));
English (`en`) is the only other language today. Backend plugin:
`backend/src/plugins/translation-drift/`, dashboard:
`backend/src/dashboard/translation-drift/`.

## Missing translations

The system SHALL report every translatable catalog field whose Hungarian
value is non-empty and whose English value is missing or blank, as a gap row
carrying the entity type, business key, display label, field and the
Hungarian text. The scanned entities and fields: Product (name, description
and the translation custom fields `shortDescription`, `tagline`), Material
(label, subtitle, description) and its colors (label), product definition
(every localized text object inside the definition JSON), ShippingMethod
(name, description), Promotion (name, description), Collection (name,
description), Facet and FacetValue (name). Soft-deleted products, shipping
methods and promotions are not scanned. The page is readable with the
catalog-read permission, paged 50 at a time, filterable by entity type.

- **Scenario: English row missing entirely**
  - WHEN a product has no `en` translation row
  - THEN its name and description (and non-empty custom fields) are reported
    as gaps, not silently skipped
- **Scenario: Empty Hungarian source**
  - WHEN a material has no Hungarian description
  - THEN its description is not reported — there is nothing to translate
- **Scenario: Definition text**
  - WHEN a definition field's label carries only `hu`
  - THEN the gap row identifies the text by its JSON path inside the
    definition and shows the Hungarian text
- **Scenario: No gaps**
  - WHEN every scanned field has its English value
  - THEN the page shows an empty state, not zero rows of noise

## Fixing a gap

The system SHALL offer one mutation, `setTranslation`, that writes a single
translated field of a single entity, routing the write through the owning
entity's service so the audit rows and the variant re-sync fire as they do on
a dashboard save. A write must not be possible for the source language
(`hu`), for an empty value, or for an unknown entity type/field. When the
entity has no translation row for the target language yet, only the name
field may be written (creating the row); the other fields become writable
once the row exists, and the created row seeds the slugged entities' slug
from the Hungarian row. The material write is wholesale, so the mutation
carries the full stored state (labels, colors with their appearances and
translations) with only the target text changed. A definition write patches
the localized text at the gap's JSON path and refuses the write when the
Hungarian source at that path differs from the value the gap row listed.
Saved numeric ids are passed to the entity services as numbers — a string id
defeats TypeORM's update matching and turns the save into a duplicate insert.

- **Scenario: Name-first row creation**
  - WHEN the owner fixes a product's English description while the product
    has no English row
  - THEN the write is refused with a message telling them to translate the
    name first
- **Scenario: Wholesale material write**
  - WHEN the owner fixes a material color's English label
  - THEN the material's other colors, their appearances and the existing
    Hungarian labels survive the write
- **Scenario: Definition text moved on**
  - WHEN the Hungarian source at the gap's path changed since the page was
    loaded
  - THEN the write is refused and the page must be reloaded
- **Scenario: The fix follows the normal write path**
  - WHEN the owner fixes a product's English name
  - THEN an `updated` product audit row is recorded and the variant re-sync
    is re-enqueued, as on a stock-form save

## Drift detection (audit-based)

The system SHALL derive stale-translation warnings from the audit log: for
each audited entity (material, product, product definition, set promotion)
and translatable field, when the last audit row that changed the Hungarian
value is newer than the last row that changed the translation's language,
the translation is presumed drifted. Warning rows show what the Hungarian
text changed from and to, and the translation as of its last recorded
change, and are fixable inline through the same `setTranslation` mutation —
definition fixes carry the Hungarian value shown on the warning as the
expected source. A save that touched both languages in one go is one change
for both sides and produces no drift; neither do `created`/`synced`/`deleted`
rows, detail-less rows, or fields the audit labels do not break down per
language. When the new Hungarian text equals the recorded translation, the
texts are identical and nothing is reported.

The heuristic reads the audit log's display-ready details, so it inherits
their limits: values are truncated at 160 characters (the equality check
compares the truncated forms), a save lists at most 20 details (further
fields are silently untracked), whole-array suggestion edits carry no
per-language breakdown, and entities whose audit coverage records only the
Hungarian name (set promotions) or have no audit coverage at all (shipping
methods, collections, facets) cannot show drift warnings — gap rows cover
them instead.

- **Scenario: Hungarian renamed after translation**
  - WHEN the owner renames a product in Hungarian and later in English
  - THEN no drift is reported for the name (the English change is the later
    one)
- **Scenario: Hungarian renamed only**
  - WHEN the owner renames a product in Hungarian only
  - THEN the name is reported as a drift warning
- **Scenario: The fix follows the normal write path**
  - WHEN the owner fixes the drifted translation inline
  - THEN the write records its audit row and the warning disappears

## False positives

The owner SHALL be able to mark a drift warning as a false positive
("Álriasztás"). The dismissal stores the audit entry that triggered the
warning, the field and the language: the warning stays hidden until a newer
Hungarian change to the same field, which raises it again. Repeated
dismissals update the stored entry.

- **Scenario: Dismissed warning resurfaces**
  - WHEN a dismissed drift warning's field is changed in Hungarian again
  - THEN a new warning appears for the new change
- **Scenario: Dismissal survives other saves**
  - WHEN other fields of the same entity are changed after a dismissal
  - THEN the dismissed warning stays hidden

## False positives

The owner SHALL be able to mark a drift warning as a false positive. The
dismissal stores the audit entry that triggered it: the warning stays hidden
until a newer Hungarian change to the same field, which raises it again.

- **Scenario: Dismissed warning resurfaces**
  - WHEN a dismissed drift warning's field is changed in Hungarian again
  - THEN a new warning appears for the new change
