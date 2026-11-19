# GLS labels

Lets the owner create the GLS parcel label for a placed order from the
dashboard, through Vendure's native fulfillment ("Fulfill order") with the
`gls` fulfillment handler, against the MyGLS API
([ADR 0020](../adr/0020-gls-labels-via-mygls-api.md)). Tracking the parcel
afterwards (shipped/delivered, problem statuses, the buyer's "shipped"
email) is the polling worker's, added in ADR 0020's S3.

## Requirements

### Label creation

The GLS delivery methods (`gls-elore-utalas`, `gls-utanvet`) SHALL use the
`gls` fulfillment handler, so the dashboard preselects it when the owner
fulfills such an order. Fulfilling SHALL create one GLS parcel for the whole
order: the parcel's number becomes the fulfillment's tracking code, its
method is `GLS`, and the order code is the parcel's client reference and the
content printed on the label. The delivery address is the order's shipping
address — the house number rides `streetLine2` and is split into GLS's
numeric house number and the rest ("12/A" → 12 + "/A") — and the recipient's
phone (the address's, else the customer's) and email go to GLS as the
delivery contact. The sender is the channel's **GLS feladó** setting.

The handler SHALL refuse, with a Hungarian reason shown as the fulfillment
error and nothing created at GLS, when:

- the order's delivery method is not a GLS one;
- the order already has a non-cancelled GLS fulfillment (GLS itself would
  create a second parcel);
- the fulfillment does not cover every line in full;
- the shipping address lacks the name, street, city, postal code or country
  (the reason names the missing parts);
- the channel's GLS sender is incomplete (the reason names the missing parts
  and where to fill them in).

Label creation SHALL never be retried automatically. When GLS does not
answer, the reason warns that the parcel may still exist and to check MyGLS
(by the order code) before trying again.

- **Scenario: Prepaid order**
  - WHEN the owner records the bank transfer on a `gls-elore-utalas` order
    and fulfills it
  - THEN the fulfillment carries the parcel number as its tracking code and
    the label collects no cash
- **Scenario: Utánvét order**
  - WHEN a `gls-utanvet` order is fulfilled
  - THEN the label collects the order total minus its authorized and
    settled payments, in the order's currency, with the order code as the
    COD reference; a fully paid order collects nothing
- **Scenario: Partial fulfillment**
  - WHEN the owner fulfills only some of an order's items with the `gls`
    handler
  - THEN the fulfillment is refused and no parcel is created

### Label file

The label PDF SHALL be stored privately at creation (GLS hands it out only
once) and served only through the admin API's `glsLabel(fulfillmentId)` to
admins who may read orders. It SHALL be dropped when the fulfillment is
cancelled (and, once S3 lands, when the parcel is delivered); afterwards
`glsLabel` returns nothing and reprints go through MyGLS.

### Cancellation

Cancelling a GLS fulfillment SHALL delete the parcel at GLS first. When GLS
refuses (e.g. the parcel was already handed over), the cancellation SHALL be
blocked with GLS's reason. A parcel already gone at GLS (deleted in MyGLS)
does not block it. A parcel created in another GLS environment (e.g. a live
parcel in a preview's copy of the production database) SHALL NOT be deleted
from this one; its cancellation is blocked with that reason. After a
cancellation the order can be fulfilled with a new label.

- **Scenario: Relabel**
  - WHEN the owner cancels a GLS fulfillment and fulfills the order again
  - THEN the first parcel is deleted at GLS, its PDF is gone, and the new
    fulfillment has a new parcel number
