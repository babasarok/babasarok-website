# order-submission

## Purpose

Lets buyers place an order request for configured products: an order form on
the contact page collects the basket plus contact and delivery details, shows
the computed order total, and submits the order as an email via Web3Forms.

## Requirements

### Requirement: Order form

The system SHALL provide an order form on the contact page where a buyer can
add orderable products, configure each (quantity, fields, materials), choose a
delivery method, and provide name, email, phone, delivery address, and an
optional message.

#### Scenario: Configuring an order

- **WHEN** a buyer adds products with their selections and fills in their
  contact details
- **THEN** the form shows each line with its price and a running order total

#### Scenario: Delivery method selection

- **WHEN** a buyer selects a delivery method
- **THEN** the method's price is included in the order total, and an address
  field is required when the method requires one

### Requirement: Order validation

The system SHALL validate the order before submission: every line must be
complete (required fields and materials chosen), a delivery method must be
selected, an address must be present when required, and name/email must be
provided.

#### Scenario: Incomplete order

- **WHEN** a buyer attempts to submit an order with an incomplete line or
  missing required details
- **THEN** the submission is blocked and a message tells the buyer what to fix

### Requirement: Order total

The system SHALL compute the order total as the sum of all line total prices
plus the selected delivery method's price, and flag the total as non-final
when any line is indeterminate.

#### Scenario: Total with delivery

- **WHEN** a basket has lines and a delivery method is selected
- **THEN** the order total equals the sum of the line totals plus the delivery
  price

#### Scenario: Indeterminate total

- **WHEN** any line's price is indeterminate
- **THEN** the order total is marked as a non-final price

### Requirement: Order submission

The system SHALL submit the order by posting a Web3Forms form payload containing
the buyer's name, email, phone, delivery method (and address when required),
message, the computed total, and one text block per product describing its
quantity, configured fields (indented per dependency level), materials with
colors, price breakdown, unit price (and per-meter price for length-priced
items), and total.

#### Scenario: Successful submission

- **WHEN** a valid order is submitted and Web3Forms accepts it
- **THEN** the buyer sees a confirmation and the order is not kept in a
  re-submittable failed state

#### Scenario: Submission failure

- **WHEN** Web3Forms rejects the request or the network request fails
- **THEN** the buyer sees a generic error message and can retry; the order
  details remain intact
