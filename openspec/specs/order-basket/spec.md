# order-basket

## Purpose

Holds the buyer's in-progress order (product lines with quantities, field
values, and material selections) and persists it so selections survive page
reloads and revisits.

## Requirements

### Requirement: Basket lines

The system SHALL represent the basket as a list of lines, each referencing a
product and holding its quantity, the buyer's configured field values, and the
chosen material values per slot.

#### Scenario: Adding a product

- **WHEN** a buyer configures a product (quantity, options, materials) and
  adds it to the order
- **THEN** the basket holds a line for that product carrying exactly those
  selections

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
