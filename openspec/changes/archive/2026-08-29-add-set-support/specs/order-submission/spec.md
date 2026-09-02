# order-submission

## MODIFIED Requirements

### Requirement: Order form

The system SHALL provide the order form on a dedicated checkout page
(`/checkout`), where a buyer can manage the basket lines (quantity, fields,
materials, removal), see active set deals, choose a delivery method, and
provide name,
email, phone, delivery address, and an optional message. The contact page
SHALL NOT host the order form; it keeps the contact information and links to
the checkout page.

#### Scenario: Configuring an order

- **WHEN** a buyer adds products with their selections and fills in their
  contact details on the checkout page
- **THEN** the form shows each line with its price and a running order total

#### Scenario: Delivery method selection

- **WHEN** a buyer selects a delivery method
- **THEN** the method's price is included in the order total, and an address
  field is required when the method requires one

#### Scenario: Contact page without form

- **WHEN** a visitor opens the contact page
- **THEN** they see the contact information and a link to the checkout page,
  but no order form
