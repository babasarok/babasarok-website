# order-basket

## Purpose

Holds the buyer's in-progress order (product lines with quantities, field
values, and material selections) and persists it so selections survive page
reloads and revisits.

## Requirements

### Requirement: Basket lines

The system SHALL represent the basket as a list of lines, each carrying a
stable identity and referencing a product, holding its quantity, the buyer's
configured field values, and the chosen material values per slot.

#### Scenario: Adding a product

- **WHEN** a buyer configures a product (quantity, options, materials) and
  adds it to the order
- **THEN** the basket holds a line for that product carrying exactly those
  selections

#### Scenario: Adding a duplicate line

- **WHEN** a buyer adds a line identical to an existing one (same product,
  field values, and material selections)
- **THEN** the quantities merge into a single line rather than creating a
  duplicate

#### Scenario: Removing a line

- **WHEN** a buyer removes a product from the order
- **THEN** the basket no longer holds a line for that selection

### Requirement: Basket persistence

The system SHALL persist the basket to browser localStorage under a versioned
key, storing only the user-entered selections (field values, materials,
quantities) plus the buyer's contact and delivery details.

#### Scenario: Reload restores the basket

- **WHEN** a buyer who saved selections returns to the site
- **THEN** the previously saved selections are restored into the order form

#### Scenario: Stale or corrupt state

- **WHEN** the persisted state has a version mismatch or fails validation
- **THEN** it is discarded and the order starts empty

#### Scenario: Storage unavailable

- **WHEN** localStorage is unavailable (e.g. blocked by the browser)
- **THEN** the order still works in-session without persisting and without
  erroring

### Requirement: Shared live basket

The system SHALL expose a single live basket view shared by every order UI on
the page (product configurators, nav basket, checkout form), reflecting the
persisted basket and updating immediately when any of them changes it.
Changes made in another browser tab MUST be picked up.

#### Scenario: Cross-island update

- **WHEN** a buyer adds a product on a product page
- **THEN** the nav basket count and any other order UI on the page update
  without a reload

#### Scenario: Cross-tab update

- **WHEN** the basket changes in a different browser tab
- **THEN** the order UIs in this tab update to reflect the change

### Requirement: Navigation basket

The system SHALL show a basket indicator in the site header on all pages
except the checkout page, displaying the total number of basket units and
linking to the checkout page.

#### Scenario: Header count

- **WHEN** the basket contains units
- **THEN** the header shows a basket link with that total count

#### Scenario: On the checkout page

- **WHEN** a visitor is on the checkout page
- **THEN** the header does not show the basket indicator
