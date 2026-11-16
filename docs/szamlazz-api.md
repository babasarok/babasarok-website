# Számlázz.hu and AutoKassza — API grounding for ADR 0019

Last verified: 2026-11-15.

This document grounds the Számlázz.hu and AutoKassza claims in
[ADR 0019](adr/0019-barion-payment-integration.md) against primary sources.
Every claim below was read on an official page the day it was verified; the
URL follows each claim. Hungarian terms are quoted and translated inline.

Primary sources used:

- The official API documentation site: <https://docs.szamlazz.hu> (Hungarian
  and English editions; the Hungarian pages were read).
- The authoritative XML schemas served by Számlázz.hu itself, notably
  <https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd> (the invoice
  request XSD).
- The official knowledge base: <https://tudastar.szamlazz.hu/gyik>.
- The official product pages: <https://szamlazz.hu/szamla-agent-api>,
  <https://szamlazz.hu/autokassza>.

## 1. The API landscape

**What the ADR assumes:** a Számlázz.hu API exists; its version and canonical
docs are unconfirmed.

**What the official docs say:**

- The API is the **Számla Agent** — "a Számlázz.hu API interfésze, amely 2010
  óta folyamatosan működik" (the Számlázz.hu API interface, running
  continuously since 2010). It exchanges simple XML messages over HTTP.
  There is **no "Számlázz.hu API v3"** — the 3.0/4.0/5.0 versioning found in
  the docs belongs to a different product, the *Pénzügyi adatkapcsolat*
  (financial data connection, see §6), not to the Agent.
  <https://docs.szamlazz.hu/hu/agent/basics/what-is>
- **Canonical doc site:** <https://docs.szamlazz.hu> (Docusaurus-based,
  hu/en). Sections: Számla Agent, PHP API, Pénzügyi adatkapcsolat, Megbízott
  számlakibocsátás. The official PHP wrapper module has its own docs at
  <https://docs.szamlazz.hu/hu/php/>. Site footer showed build `v202611101359`
  (2026-11-10), i.e. actively maintained as of the verification date.
- **Transport:** every operation is an HTTPS `POST` to the single URL
  `https://www.szamlazz.hu/szamla/` with `multipart/form-data`; the **name of
  the form field carrying the XML selects the operation**:
  `action-xmlagentxmlfile` (invoice), `action-szamla_agent_st` (storno),
  `action-szamla_agent_kifiz` (credit entry), `action-szamla_agent_pdf` /
  `action-szamla_agent_xml` (document queries), 
  `action-szamla_agent_dijbekero_torlese` (díjbekérő deletion), nyugta
  (receipt) operations, `action-szamla_agent_taxpayer`. One XML = one
  document. <https://docs.szamlazz.hu/hu/agent/basics/sending-requests>
- **Auth:** an **Agent key** (`<szamlaagentkulcs>` in the XML) is the
  recommended credential; username + password (`<felhasznalo>`/`<jelszo>`) is
  the alternative. Agent keys never expire, are case-sensitive and must be
  lowercase, a account may hold at most 17 keys, and all keys of an account
  have identical full rights — no per-key scoping. A username usable with the
  Agent must have access to exactly one invoicing account (error 164
  otherwise).
  <https://docs.szamlazz.hu/hu/agent/basics/authentication>
- **Rate limiting:** the docs document a limit only for the **test
  environment: max 500 invoices per 10 minutes**. For production the docs
  prescribe behavior, not a number: never loop failed requests, at most **5
  attempts for the same request**, repeated violation ("túlzott
  újrapróbálkozás vagy indokolatlan szerverterhelés") can lead to a ban.
  **UNVERIFIED:** a hard production throughput limit is not published.
  <https://docs.szamlazz.hu/hu/agent/basics/error-handling>
- **Pricing:** the Számla Agent is a paid add-on **independent of the account
  package** (usable even with #free), tiered by documents issued per month:
  1–50 docs 2 690 Ft + áfa/hó; 51–3 000 → 9 990 Ft + áfa/hó; 3 001–10 000 →
  14 990 Ft + áfa/hó; above 10 000, +14 990 Ft + áfa per started 10 000.
  Billing is post-paid on the previous month's document count.
  <https://szamlazz.hu/szamla-agent-api>
- **Testing:** "Az automatikus számlázás tesztelése **kizárólag teszt
  fiókban** történhet" — testing must happen in a dedicated test account
  (self-created per <https://tudastar.szamlazz.hu/gyik/teszt-api-hozzaferes>);
  testing in the live account can halt the account's auto-invoicing and the
  Agent fee still applies. Same product page.

## 2. Invoice types the API can create

**What the ADR assumes:** díjbekérő, előlegszámla, végszámla with előleg
beszámítása, and stornó are API capabilities.

**What the official docs say:** all confirmed — one endpoint, type flags in
the `<fejlec>` (header) block:

- **Díjbekérő** (payment request; "előzetes fizetési felszólítás, jogilag nem
  számlának minősül" — an advance payment demand, legally not an invoice):
  `<dijbekero>true</dijbekero>`.
  <https://docs.szamlazz.hu/hu/agent/generating_invoice/settings_and_rules/document-types>
- **Előlegszámla** (advance/deposit invoice): `<elolegszamla>true</elolegszamla>`.
- **Végszámla** (final invoice settling the remainder after an előlegszámla):
  `<vegszamla>true</vegszamla>`. **Constraint:** "egy előlegszámlához csak
  egy végszámla állítható ki" — exactly one final invoice per advance
  invoice; no partial (rész)számlák from one előlegszámla, and several
  előlegszámlák cannot be aggregated into one végszámla. Same page.
- **Előleg beszámítása** (deposit set-off): the pairing between the
  végszámla and its előlegszámla happens **via the order number
  (`rendelesSzam`) or explicitly via `<elolegSzamlaszam>`** — XSD comment:
  "ha a végszámlázandó előlegszámla nem azonosítható a rendelésszámmal, akkor
  itt megadhatod az előlegszámla számlaszámát" (if the advance invoice to be
  settled cannot be identified by the order number, give its invoice number
  here). Source of both: the XSD itself,
  <https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd>. So the ADR
  must put the order number (`rendelesSzam`) on the előlegszámla, or carry
  the előlegszámla's number into the végszámla request.
- **Számla stornó** (void): a separate operation
  (`action-szamla_agent_st`), documented at
  <https://docs.szamlazz.hu/hu/agent/reversing_invoice/request>. Storno
  invoices cannot receive paired transactions via AutoKassza (§6).
- **Helyesbítő számla** (corrective invoice):
  `<helyesbitoszamla>true</helyesbitoszamla>` +
  `<helyesbitettSzamlaszam>`.
- **Invoice from a díjbekérő:** reference the díjbekérő's number in
  `<dijbekeroSzamlaszam>` — a documented API flow with a step-by-step recipe
  ("Díjbekérőre hivatkozás"). Same document-types page.
- **Szállítólevél** (delivery note) can be created via the API but **cannot
  be invoiced or marked spoiled ("rontott") through the Agent** — web UI
  only. Worth knowing, not needed by the ADR flow.

The document-type listing is confirmed on the product page too: "e-számla,
papíralapú számla, nyugta, díjbekérő, szállítólevél, helyesbítő számla,
sztornó számla, előlegszámla, végszámla."
<https://szamlazz.hu/szamla-agent-api>

## 3. Payment methods (átutalás ↔ utánvét)

**What the ADR assumes:** the API can set the payment method, and the flow
switches between átutalás (transfer) and utánvét (COD).

**What the official docs say:**

- The payment method is the `<fizmod>` header field — **a free-text string**
  (XSD: `type="string"`, required). The sample XML sends
  `<fizmod>Átutalás</fizmod>`; the docs comment it as "fizetési mód, látható,
  ha a számlát böngészőből készíted" (payment method, shown on the
  document). There is no enum for invoices — the issuer's text is what
  appears. Készpénz (cash), utánvét (COD), átutalás (transfer), bankkártya
  are all just strings the integrator sends.
  <https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd>
- The payment method recorded **per payment** (credit entry) is likewise free
  text: `<kifizetes><jogcim>készpénz</jogcim>` / `átutalás`.
  <https://docs.szamlazz.hu/hu/agent/credit_entry/xml>
- **Switching after creation: not an API capability.** The Agent's operation
  set is closed (create, storno, credit entry, PDF/XML query, díjbekérő
  deletion, receipt operations, taxpayer query) — there is no "edit issued
  document" operation in the docs. The practical shape for the ADR flow: the
  backend knows the branch before it issues, so it sets `fizmod` correctly at
  creation time; a mismatch afterwards means storno + reissue (which is
  question 12's számla-correction path).
  <https://docs.szamlazz.hu/hu/agent/basics/sending-requests>

## 4. Line items, deadline, prefixes

**What the ADR assumes:** line-itemized payment requests, a configurable
(+3-day) deadline, and invoice prefixes are API-settable.

**What the official docs say:** all three confirmed.

- **Line items (tételek):** `<tetelek><tetel>` is `maxOccurs="unbounded"` —
  a díjbekérő carries the same item structure as an invoice (name, quantity,
  unit, unit price, VAT, amounts, comment). The Agent does **no arithmetic**:
  the caller must send every amount, and the service only validates
  `nettoEgysegar × mennyiseg = nettoErtek` and `nettoErtek + afaErtek =
  bruttoErtek` per line (errors 259–264 otherwise).
  <https://docs.szamlazz.hu/hu/agent/generating_invoice/xml>
- **Deadline:** `<fizetesiHataridoDatum>` (payment deadline) is a required
  explicit `date` in the header — the +3 business days is computed by the
  caller and sent as a date. Same XSD.
- **Prefixes (előtagok):** `<szamlaszamElotag>` in the header selects one of
  the prefixes registered in the invoicing account ("A számlázz.hu-ban
  használható Előtagok egyike — Beállítások / Előtagok"). Sending an
  unregistered prefix fails with error 202. The docs explicitly recommend
  separate prefixes to separate sources: "Ha a Számla Agentet több
  webáruházhoz is használod … használj külön számlaszám előtagot
  (`szamlaszamElotag`) mindegyikhez."
  <https://docs.szamlazz.hu/hu/agent/basics/sending-requests>

## 5. The auto-előlegszámla setting — CONTRADICTION

**What the ADR claims:** "Számlázz.hu's auto-előlegszámla is unusable … the
rule is per-account, not per-branch."

**What the official docs say:**

- The on/off switch **"Díjbekérő automatikus számlázása"** is indeed an
  account-level setting (Beállítások / Fiók beállításai / Számlázás
  beállítások, "Díjbekérő beállításai"). When on, a díjbekérő settled by
  online payment or by an AutoKassza-paired transfer automatically produces
  an invoice with paid status, mails the invoice notification, and (if
  "Díjbekérő automatikus törlése" is also on) deletes the díjbekérő.
  <https://tudastar.szamlazz.hu/gyik/dijbekero-szamla-autokassza-kapcsolat>
- **But the document type the auto-invoice gets — előlegszámla or normál
  számla — is configured per invoice prefix, not per account:** in
  Beállítások / Előtagok, each prefix's settings page has its own
  "Díjbekérő automatikus számlázása" dropdown choosing előlegszámla vs
  normál számla. "A beállítást számlatömbönként szabályozhatod a fiók
  beállításaiban." (You can regulate the setting per invoice-number block.)
  <https://tudastar.szamlazz.hu/gyik/dijbekero-automatikus-szamlazasa>
- **CONTRADICTION:** the ADR's premise ("per-account, not per-branch") does
  not hold as stated — the per-prefix setting *is* a branch lever, because
  the branches can use different prefixes (§4). The full rule set is
  "account-level on/off × per-prefix document type", still not
  per-invoice/per-order. Two caveats survive from the ADR's instinct: the
  auto-invoicing fires only for online-payment or AutoKassza settlements —
  "Ha díjbekérőt kézzel állítasz kifizetettre banki tranzakció párosítás
  helyett, akkor abból a számla nem készül el automatikusan" (a díjbekérő
  manually marked paid produces no automatic invoice);
  <https://tudastar.szamlazz.hu/gyik/hogyan-mukodik-az-autokassza> — and the
  rule applies to *every* paid díjbekérő using that prefix, which is why the
  branches must be separated by prefix (or the backend issues everything via
  the Agent and leaves the account-level switch off).

## 6. Webhooks / payment events (ADR question 7)

**What the ADR asks:** does Számlázz.hu or AutoKassza expose an API/webhook
for payment pairing or díjbekérő payment events?

**Answer: yes — Számlázz.hu has two push mechanisms, and the IPN is exactly
the missing hook the ADR hoped for.** AutoKassza itself has no standalone
API; it is a feature of the Számlázz.hu account, and its events reach
external systems only through these two channels.

### 6.1 IPN (Instant Payment Notification) — the payment-confirmation hook

- What fires it: "bizonylatok (számla, díjbekérő) kifizetettségéről
  értesítést … kapjon a webáruház" — the webshop receives a notification
  whenever a document's **paid amount changes** (full or partial payment;
  the tudástár adds "nem csak akkor, ha fizetés történik, hanem akkor is,
  ha részteljesítés történik" — also on partial payments). This includes
  the AutoKassza path: AutoKassza pairs the bank line → the díjbekérő's (or
  invoice's) paid amount changes → Számlázz.hu POSTs the IPN.
  <https://docs.szamlazz.hu/hu/agent/credit_entry/other>,
  <https://tudastar.szamlazz.hu/gyik/mi-az-ipn>
- Configuration: a single per-account IPN URL, set at the bottom of
  Fiók beállítások / Számlázás alapadatok
  (<https://www.szamlazz.hu/app/beallitasok-alapadatok/szamla-alapadatok>).
- Shape: HTTP POST, body `application/x-www-form-urlencoded` (the tudástár
  shows the same fields GET-style for readability). Fields:

  | Field | Meaning |
  | --- | --- |
  | `szlahu_szamlaszam` | number of the document (invoice, or the díjbekérő itself) |
  | `szlahu_dijbekero_szama` | the parent díjbekérő's number when the invoice was made from one, else empty |
  | `szlahu_rendelesszam` | order number, if it appears on the document |
  | `szlahu_bruttovegosszeg` | gross total of the document |
  | `szlahu_kifizetettbrutto` | **cumulative** gross paid so far (state, not delta — overwrite, never add) |
  | `szlahu_fizetesmod` | payment method of the payment: `kp`, `bankkártya`, `átutalás` |
  | `szlahu_kifizdat` | payment date (YYYY-MM-DD) — **off by default, must be activated via customer support** |

- Díjbekérő specifics: with "Díjbekérő automatikus számlázása" on, the paid
  díjbekérő becomes an invoice and the IPN comes from the invoice
  (`szlahu_szamlaszam` = invoice number, `szlahu_dijbekero_szama` = the
  díjbekérő, `szlahu_rendelesszam` inherited); with the switch off (or a
  manually-paired partial transaction), the IPN comes from the díjbekérő
  itself (`szlahu_szamlaszam` = the díjbekérő number,
  `szlahu_dijbekero_szama` empty).
- Response: HTTP 200 with an irrelevant body. Retry semantics are unusual
  and must shape the receiver: delivery runs every 3 minutes; if the
  receiver returns **any non-200 HTTP status, the IPN is dropped and never
  retried** (the sender records the status code); only a *missing* HTTP
  response (timeout, refused connection, DNS failure) is retried, up to 11
  attempts total. Queued IPNs are only retried for 5 days. On processing
  failure the correct recovery is to re-query the document via
  `action-szamla_agent_xml`.
- Trust: **the IPN carries no signature or credential.** The docs recommend
  a secret token in the URL (over HTTPS) plus IP allowlisting, and verifying
  by re-querying the document via `action-szamla_agent_xml`. Sender IPs
  (since 2025-08-01): 3.73.214.98, 3.76.149.232, 18.153.156.51.
- The docs page is explicit that the IPN is a **state notification, not an
  event stream**: duplicates collapse (only the newest IPN per document is
  kept), so the receiver must treat `szlahu_kifizetettbrutto` as
  authoritative state.

### 6.2 Pénzügyi adatkapcsolat (online financial data connection) — the raw bank-transaction push

- A registered receiving system can have Számlázz.hu **push** invoice,
  receipt and **bank transaction** data to it: "a Számlák, nyugták és banki
  tranzakciók minden adatát online elküldje valamilyen külső rendszer felé".
  Bank transactions exist from connection version 4.0 and "csak olyan cégek
  számlázási fiókjaiban értelmezhető, ahol aktív autokassza kapcsolat van"
  — only meaningful where an active AutoKassza connection feeds transactions
  into the account. <https://docs.szamlazz.hu/hu/penzugyi-adatkapcsolat/introduction>
- Direction and shape: **PUSH only** — "Nincs lehetőség arra, hogy a fogadó
  rendszer 'lekérdezze' a számlaadatokat" (the receiver cannot poll). One
  HTTP POST per record, `application/xml` UTF-8 body, one record per XML;
  the identification key rides the `X-Szamlazzhu-Key` header (max 40 chars,
  its last 5 characters must match the postfix registered for the receiving
  system). Invoices arrive within 15 minutes of issuance; bank transactions
  arrive batched, periodically; receipts once a day.
  <https://docs.szamlazz.hu/hu/penzugyi-adatkapcsolat/mukodes>
- Bank transaction payload (`banktranz.xsd`): `id`, `bankszamla`,
  `erteknap`, `irany` (BE/KI), `tipus`, `technikai`, `osszeg`, `devizanem`,
  `partner` (name, bank account), `kozlemeny`. **Note: it is the raw
  transaction — there is no díjbekérő/invoice reference field**, so pairing
  results do not ride this channel; the pairing outcome reaches the backend
  via the IPN (§6.1).
  <https://docs.szamlazz.hu/hu/penzugyi-adatkapcsolat/banki-tranzakciok>
- Receiver obligations: HTTP 200 + a correct response XML per the
  operation's XSD (`banktranzvalasz.xsd` for transactions); redirects (302)
  are explicitly unsupported; failed deliveries are retried for 72 hours,
  then the item is parked ("parkolópálya") and never re-sent; a receiver
  that misbehaves for long is deactivated and reactivated only manually by
  Számlázz.hu IT support.
  <https://docs.szamlazz.hu/hu/penzugyi-adatkapcsolat/mukodes>
- Package: the Pénzügyi adatkapcsolat is a **#profi** feature ("Pénzügyi
  adatkapcsolat — #profi — Bizonylatadatok, banki tranzakciók automatikus
  átadása külső programnak"). <https://szamlazz.hu/szamla-agent-api>
  (Kapcsolódó szolgáltatásaink section). AutoKassza itself requires
  **#digital** or above. <https://szamlazz.hu/autokassza>

### 6.3 Search trail for a standalone AutoKassza API (negative result)

AutoKassza is **not a separate product with its own developer surface** — it
is Számlázz.hu's bank-integration feature, operated under Számlázz.hu's MNB
AISP license (<https://szamlazz.hu/autokassza>). What was checked:

1. Web search "docs.szamlazz.hu Számla Agent API dokumentáció" and
   "szamlazz.hu API v3 számlaagent dokumentáció" — no separate AutoKassza
   docs surfaced; docs.szamlazz.hu has exactly four sections (Számla Agent,
   PHP API, Pénzügyi adatkapcsolat, Megbízott számlakibocsátás) and no
   AutoKassza section. Nothing to fetch beyond the Pénzügyi adatkapcsolat.
2. Web search "autokassza.hu dokumentáció banki tranzakció párosítás
   díjbekérő" — only Számlázz.hu-owned pages (tudastar articles,
   szamlazz.hu/autokassza) and bank partner pages (K&H, Raiffeisen, MagNet)
   describing the same feature. No developer API.
3. Web search "\"autokassza\" API webhook integráció fejlesztőknek" — the
   only developer-facing mentions are the Számla Agent API and the Online
   adatkapcsolat links in the szamlazz.hu footer; the official WooCommerce
   plugin page confirms the integration mechanism is the IPN: "A
   Számlázz.hu-s Autokassza funkció segítségével a díjbekérő
   kifizetettségéről értesítést kaphat a webáruház"
   (<https://wordpress.org/plugins/integration-for-szamlazzhu-woocommerce>).
4. Checked <https://docs.szamlazz.hu/hu/agent/basics/sending-requests> (the
   complete operation table) — no bank-transaction or pairing endpoint
   exists in the Számla Agent itself; transaction data flows out only via
   the Pénzügyi adatkapcsolat push.

**Conclusion:** for the ADR's question 7 the answer is "yes, via Számlázz.hu
IPN" — an AutoKassza-paired transfer on a díjbekérő produces an IPN POST to
the webshop, carrying the díjbekérő number, order number, cumulative paid
amount and payment method. There is no AutoKassza-native API or webhook, and
no polling API for transaction-pairing events (the Pénzügyi adatkapcsolat
pushes raw transactions and cannot be polled).

## 7. NAV / online számla and the 27% ÁFA

**What the ADR asks:** where NAV/online-számla reporting and the 27% ÁFA
setup interact with the flow; does a Barion-card payment change what the
invoice must show?

**What the official docs say:**

- **NAV reporting is automatic once the account is connected:** Számlázz.hu
  "átvállalja … a számla- és nyugta-adatszolgáltatási kötelezettség terhét"
  and submits issued invoices to the NAV Online Számla system — the account
  owner creates a NAV technical user and connects it once (step-by-step
  guide at <https://szamlazz.hu/nav-online-szamlazas-regisztracios-segedlet>).
  Delivery status is visible per invoice and in the account's notifications;
  failures have a dedicated troubleshooting article.
  <https://tudastar.szamlazz.hu/gyik/nav-online-szamla-adatszolgaltatas>,
  <https://szamlazz.hu/nav-online-szamlazas>
- The Agent request carries the escape hatch for foreign VAT: the XSD's
  `<eusAfa>` flag — "A számla nem magyar áfát tartalmaz, Online Számla
  adatküldés nem szükséges" (the invoice contains non-Hungarian VAT; Online
  Számla submission is not required). Same XSD.
- **Payment method on the invoice:** the invoice shows and reports whatever
  `fizmod` string the issuer sends (§3) — a Barion-card payment does not
  force anything beyond that choice; nothing in the Számlázz.hu docs ties
  the funding source of the money to a mandatory invoice field. **UNVERIFIED
  beyond Számlázz.hu:** whether NAV's own Online Számla spec constrains the
  fizetési mód value for card payments was not researched here (that is a
  NAV specification question, not a Számlázz.hu one).
- **27% ÁFA:** it is simply the per-line `<afakulcs>27</afakulcs>` value the
  caller sends; valid Hungarian rates include `0`, `5`, `18`, `27`, `AAM`,
  `TAM`, `K.AFA`, `F.AFA` (error 553 lists them). The Agent computes
  nothing (§4), so the 27% default lives entirely in the backend's invoice
  builder. VAT-rate guidance:
  <https://docs.szamlazz.hu/hu/agent/generating_invoice/settings_and_rules/vat-rates>

## 8. What the ADR missed

- **Marking a document paid via the API exists — for díjbekérők too.** The
  credit-entry operation (`action-szamla_agent_kifiz`, `xmlszamlakifiz.xsd`)
  searches "saját kiállított (kimenő) bizonylatok között … számlák és
  díjbekérők között" when `adoszam` is omitted, and takes one or more
  `<kifizetes>` entries (date, `jogcím` = payment method, amount, optional
  description). The `additiv` flag decides whether previous credit entries
  survive ("ha true, a korábbi jóváírások megmaradnak") or are replaced.
  <https://docs.szamlazz.hu/hu/agent/credit_entry/xml>
- **Per-document status polling exists.** `action-szamla_agent_xml` returns
  the full document XML, including the document type code (`<alap><tipus>`:
  `SZ` számla, `ES` előlegszámla, `VS` végszámla, `HS` helyesbítő, `SS`
  sztornó, `JS` jóváíró számla, `D` díjbekérő, `SL` szállítólevél), the
  payment deadline, `fizmod`, and the `<kifizetesek>` block (each recorded
  payment with date, method, amount). Lookup is by invoice number, order
  number, or the `szamlaKulsoAzon` external ID set at creation (error 7 if
  unknown). **No list/search endpoint exists** — polling is per known
  document only. <https://docs.szamlazz.hu/hu/agent/querying_xml/response>
- **`<fizetve>` and `<fizetendoKorrekcio>`:** an invoice can be created
  already marked paid (`<fizetve>true</fizetve>`) and the payable amount can
  be corrected (`<fizetendoKorrekcio>`) — both from the XSD. Relevant for
  the "invoice issued after a recorded Barion payment" branch.
- **External correlation ID:** `<szamlaKulsoAzon>` lets the backend stamp
  its own ID on the document at creation and query by it later — the
  natural carrier for the Vendure order/payment reference. (Same XSD.)
- **Bilingual invoices:** `<szamlaNyelve>` accepts 14 languages including
  `en` (`hu, en, de, it, ro, sk, hr, fr, es, cz, pl, bg, nl, ru, si`). Same
  XSD. Foreign-currency invoices carry `arfolyam`/`arfolyamBank` with
  automatic MNB rate pickup.
- **Order-number duplicate protection:** with the account setting
  "Rendelésszám ismétlődés tiltása" on, a repeated `rendelesSzam` fails with
  errors 71/152 — a ready-made idempotency guard for automated issuing.
  <https://docs.szamlazz.hu/hu/agent/basics/error-handling>
- **Számlázz.hu's own online payment already speaks Barion.** The "Online
  fizetés" feature (from #digital) lets the buyer pay the account's
  receivables by card through **SimplePay or Barion** ("online bankkártyás
  fizetés vevőidnek (SimplePay, Barion)"), and a díjbekérő settled that way
  triggers the same auto-invoicing and IPN path as an AutoKassza pairing
  (§5). A "thin" alternative to a custom Barion integration — the backend
  would get the payment event via IPN instead of a Barion callback — at the
  cost of leaving the checkout redirect/UX to Számlázz.hu's flow. The ADR
  does not mention this option.
  <https://szamlazz.hu/autokassza>,
  <https://tudastar.szamlazz.hu/gyik/dijbekero-szamla-autokassza-kapcsolat>
- **Invoice emails are controllable from the API:** `sendEmail` (customer
  notification on/off), `emailTargy`/`emailSzoveg` (subject/body),
  `emailReplyto`. Same XSD; details at
  <https://docs.szamlazz.hu/hu/agent/generating_invoice/settings_and_rules/email-notification>.
- **Courier data on the invoice:** the optional `<fuvarlevel>` block accepts
  GLS among the carriers (`futarSzolgalat`: TOF, PPP, SPRINTER, FOXPOST,
  MPL, GLS) — a way to print the parcel number on the invoice, adjacent to
  ADR 0018. Same XSD.
- **Agent pricing tier matters for volume:** §1's tiered fee applies on top
  of the account package; at babasarok's expected volume (tens of invoices
  monthly) the 1–50 tier (2 690 Ft + áfa/hó) applies.
  <https://szamlazz.hu/szamla-agent-api>

## Implications for ADR 0019

- **Question 4 has a de-facto answer: everything the flow needs exists.**
  Díjbekérő, előlegszámla, végszámla (one-to-one with its előlegszámla, with
  set-off pairing via `rendelesSzam` or `elolegSzamlaszam`), stornó,
  line-itemized documents, an explicit `fizetesiHataridoDatum`, and
  registered prefixes selectable via `szamlaszamElotag`. Payment method is
  set at creation only — no edit-after-issue — so the átutalás ↔ utánvét
  choice must be made by the backend before issuing, not corrected after.
- **Question 5's premise needs revision (CONTRADICTION):** the
  auto-előlegszámla choice is **per prefix**, not per account — separate
  prefixes per branch make the auto-invoice type a branch property. The
  on/off switch stays account-level and only fires on AutoKassza/online
  settlements, so "backend issues everything via the Agent" remains the
  cleaner default; prefixes remain the branch marker either way.
- **Question 7 has a de-facto answer: listen via IPN.** The IPN covers
  díjbekérő *and* invoice payment events, including partial payments and
  AutoKassza pairings, and carries the order number — enough to record the
  payment on the Vendure order automatically (question 8's first branch).
  Its trust model (unsigned POST, drop-on-non-200, cumulative amount) and
  the need to verify via `action-szamla_agent_xml` are design inputs. The
  Pénzügyi adatkapcsolat (#profi) is a second, heavier channel for raw bank
  transactions — not needed if the IPN is adopted.
- **Question 6 (NAV) is largely settled:** reporting is automatic after the
  one-time NAV user connection; 27% is a per-line value the backend sends;
  a Barion payment changes only the `fizmod` string the backend chooses.
- **A new option entered the design space:** Számlázz.hu's own online
  payment runs on Barion and auto-completes the díjbekérő → invoice → IPN
  chain — worth weighing against building the custom Vendure Barion handler
  before question 9–15 work starts.
