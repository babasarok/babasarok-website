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
cancelled or when the parcel is delivered; afterwards `glsLabel` returns
nothing and reprints go through MyGLS.

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

### Status polling

Every 30 minutes, in the worker process, the open parcels of this GLS mode
(`gls_parcel` rows not deleted in GLS, fulfillment not `Delivered`/`Cancelled`)
SHALL be polled through `GetParcelListStatuses` (at most 100 parcel numbers per
call, `LanguageIsoCode: HU`; a not-yet-handed-over parcel answers error 26 and
is skipped quietly). The poll moves only the fulfillment — Vendure moves the
order — from the parcel's full status history:

- handed over (status 1) SHALL mark the fulfillment `Shipped` and email the
  buyer (hu; the order does not record the checkout language) the parcel
  number and the tracking link
  `https://gls-group.eu/HU/en/parcel-tracking?match=<csomagszám>`. The
  transition also happens for a problem parcel that was already handed over;
  it never happens for a parcel the history marks delivered.
- delivered (5/54/58/92) SHALL mark the fulfillment `Delivered` — Vendure
  closes the order — and drop the stored label PDF, but only when the order's
  authorized and settled payments cover its total. An unpaid utánvét parcel
  (the cash arrives with GLS's payout) SHALL hold in `Shipped` silently until
  the owner records the payment; the next poll closes it.
- a problem status (16 no cash, 17 refused, 20 address problem, 23/40
  returned) SHALL email the owner (the channel's notification address) once
  per distinct problem code — a new code notifies again, the same code never
  repeats — and record a private note on the order. A refused or unpaid COD
  parcel never reaches "delivered": the refusal path is what these statuses
  report.
- statuses after the latest delivery or problem (transit noise) SHALL NOT
  change the verdict; a delivery anywhere in the history wins over an earlier
  problem (the re-attempt succeeded), while a problem after a delivery is
  reported.

The verdict SHALL be a pure decision over the date-ordered history; the poll
SHALL NOT retry on a failed call beyond the next scheduled run, and SHALL log
unexpected GLS errors while ignoring error 26.

- **Scenario: Utánvét delivered before the payment is recorded**
  - WHEN GLS reports the parcel delivered while the order's payments do not
    cover the total
  - THEN the fulfillment stays `Pending`/`Shipped` and nothing is emailed;
    after the owner records the COD payment, the next poll marks it
    `Delivered` and drops the PDF
- **Scenario: Refused parcel**
  - WHEN GLS reports status 17 after hand-over
  - THEN the buyer got the shipped email (the parcel did travel), the owner
    gets one problem email for code 17 with GLS's description, and the order
    carries a private note; a later status 23 emails again
