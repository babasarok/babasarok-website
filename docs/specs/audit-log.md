# Audit log

Records who changed what in the catalog, and when, and shows it to the owner
on a dashboard page ("Változásnapló"). Architecture and trade-offs:
[ADR 0015](../adr/0015-audit-activity-log.md).

## Requirements

### What is recorded

The system SHALL record one audit row per logical catalog action: material
create/update/delete (including edits that change no variant-relevant field,
e.g. a subtitle), product definition create/update/delete, the outcome of each
product definition sync job, native product create/update/delete, and set
promotion create/update. Each row carries the time, the entity type and
business key (material slug, definition product id, native product id,
promotion id), the action, an optional human summary (a name where one is
known) and its source (`admin`, `sync` or `system`).

- **Scenario: Label-only material edit**
  - WHEN the owner changes only a material's subtitle
  - THEN an `updated` material row keyed by the slug is recorded, although no
    product sync follows
- **Scenario: One row per action, not per variant**
  - WHEN a definition save syncs hundreds of variants
  - THEN the log holds one definition `updated` row and one `synced` (or
    `sync-failed`) row for the job — no variant rows
- **Scenario: Only set promotions**
  - WHEN a promotion without the set condition and action is saved
  - THEN no audit row is recorded
- **Scenario: Rejected saves are not recorded**
  - WHEN a save is refused (a thrown error or an `ErrorResult`)
  - THEN no audit row is recorded

### What changed

Every `updated` row SHALL carry its change as structured `details`: one entry
per changed field, with a Hungarian field label and the previous and new value
(`from`/`to`, null when the field was added or removed). `created` and
`deleted` rows carry no details. Values are display-ready strings, truncated,
so one save cannot flood the log.

- **Scenario: Stock-form rename**
  - WHEN the owner renames a product on the stock product form
  - THEN the product's `updated` row lists `Név: <régi> → <új>` (per language)
    and its summary is the new name; the sync it re-enqueues reports the
    variant's rename as the `synced` row's details
- **Scenario: Definition save**
  - WHEN a definition save changes the base price and a field's price
  - THEN the definition's `updated` row lists both changes with their old and
    new values, and nothing for the fields that did not change
- **Scenario: Sync outcome**
  - WHEN a sync job applies a drift (SKU, name or price)
  - THEN the `synced` row's details list what it changed; a sync with nothing
    to apply has no details, and a failed sync records the error message
- **Scenario: Material edit**
  - WHEN a material's labels, subtitle, description, thumbnail or colors change
  - THEN the material's `updated` row lists the changes keyed by language and
    color
- **Scenario: Set promotion edit**
  - WHEN a set promotion's members, amount, enabled state or name change
  - THEN the promotion's `updated` row lists the changes, members named by
    their product names

### Attribution

The system SHALL attribute each row to the acting admin (user id and login)
when the action ran on an authenticated admin request, and SHALL NOT attribute
a row to a user who did not cause it.

- **Scenario: Sync outcome carries the enqueuing admin**
  - WHEN an admin saves a definition and the worker later syncs it
  - THEN the sync's outcome row has source `sync` and the saving admin as
    actor, although the worker's own context has no user
- **Scenario: System actions**
  - WHEN an action runs without a user (e.g. a sync re-queued at worker
    startup)
  - THEN the row has no actor and source `sync` or `system`

### Failure isolation

The system SHALL NOT fail or roll back a catalog write because its audit row
could not be written; the failure is logged instead.

### Dashboard page

The system SHALL list audit rows newest first on a "Változásnapló" page under
the catalog navigation, readable with the catalog-read permission, paged 50 at
a time, filterable by entity type, source and a date range whose end date is
inclusive (local days). Each row's Részletek column SHALL show the summary and
the changed fields with their old and new values.

- **Scenario: Filtering by entity type**
  - WHEN the owner selects "Termékdefiníció"
  - THEN only product definition rows are listed
