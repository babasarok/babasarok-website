# Felhasználókövetés

Mit küld az oldal harmadik feles analytics-/hirdetési hálózatoknak, mely események
futnak le, és milyen adatot hordoznak ezek az események. Ez a marketing-/analytics-integráció
hiteles nyilvántartása.

> Ez a fájl a [tracking.md](tracking.md) magyar fordítása; a mérvadó változat az
> angol eredeti.
> 
> 

## 1. Áttekintés

Nincs saját üzemeltetésű analytics (se Plausible/Umami/Matomo, se cookie-fal).
A követést teljes egészében kliensoldalon végzi két platform, és mindkettő
**minden oldalon** betöltődik az alap layouton keresztül:

| Platform                     | Szerep                                                                                       | Betöltés forrása                         | Hol fut le                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| **Google Tag Manager (GTM)** | Konténer, amely a Google Ads konverziós címkét (és az űrlap automatikus eseményeit) futtatja | `googletagmanager.com/gtm.js`            | Minden oldalon; konverzió + űrlapesemények a rendelési űrlapon         |
| **Meta (Facebook) Pixel**    | Oldalmegtekintések, űrlap-interakciós események és vásárlási események                       | `connect.facebook.net/en_US/fbevents.js` | Minden oldalon (`PageView`); beküldéskor (`Purchase` + űrlapesemények) |

A Google-oldalt egyetlen publikus kliensoldali env változó vezérli
([astro.config.ts](../astro.config.ts), [`.env.example`](../.env.example)):

- `GTM_ID` – a **Google Tag Manager konténer** (egy `GTM-…` azonosító), amely
  minden oldalon betöltődik. A GA4 és a Google Ads konverziós címke _azon a
  konténeren belül_ van beállítva, nem külön kódrészletként az oldalon.

Egy minimális `gtag()` shim egyszer van definiálva az alap layoutban
([src/layouts/Base.astro](../src/layouts/Base.astro)), hogy a `gtag('event', …)`
hívások betegyék a közös `dataLayer`-be azt, amiből a GTM beolvassa az
eseményeket. A `@digi4care/astro-google-tagmanager` integráció kibocsátja az
inline konténerkódrészletet és egy `<noscript>` tartalékot is.

Az oldal nem tölt be Google Analytics (GA4) kódrészletet és saját first-party
pixelt sem – a GA4, akárcsak az Ads konverzió, engedélyezés esetén a Tag Manager
konténeren belül él. Az alábbiak mind azt írják le, amiért az oldal felelős.

## 2. Az egyes elemek bekötése

- **GTM-konténer** – a `Base.astro` `<head>`-jében:
  `<GoogleTagmanager id={GTM_ID} />`, valamint a `gtag` shim és a
  `<GoogleTagmanagerNoscript>` a `<body>`-ban.
- **Meta Pixel** – [src/components/MetaPixel.astro](../src/components/MetaPixel.astro),
  a `Base.astro` `<head>`-jében renderelve. Inicializálja a pixelt, és inline
  lefuttatja a `PageView` eseményt. Ha a JS ki van kapcsolva, a `<noscript>`
  tartalék egy `<img>` beacon segítségével futtatja le a `PageView` eseményt.
- **Purchase/konverziós események** – a checkout island
  [src/components/blocks/order/CheckoutForm.svelte](../src/components/blocks/order/CheckoutForm.svelte)
  `onSubmit` eseménykezelője váltja ki őket.

## 3. Események és a küldött adatok

### 3.1 Meta Pixel

| Esemény                                                               | Mikor                                                                   | Küldött adatok                                                                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PageView`                                                            | Minden oldalbetöltéskor (JS) **és** a `<noscript>` tartalékban          | Oldal- és referrer URL, viewport, locale, cím, `fbp`, a böngészőt azonosító cookie                                      |
| `Purchase`                                                            | Érvényes rendelési űrlap beküldésekor                                   | `cd[value]` = a rendelés végösszege **HUF**-ban, `cd[num_items]` = tételszám, `cd[currency]=HUF`, oldal/referrer, `fbp` |
| Űrlap-interakciós automatikus események (pl. `SubscribedButtonClick`) | A Pixel automatikusan, a rendelési űrlaphoz kapcsolódóan váltja ki őket | **Csak az űrlap szerkezete** – lásd az alábbi megjegyzést                                                               |

A Pixel **nem küld PII-értékeket**. Az űrlap-interakciós események az űrlap
_alakját_ hordozzák, nem a tartalmát: gombszöveg (pl. `Küldöm a rendelést!`),
mező-placeholderek (`Név *`, `Email cím *`, `Telefonszám`), inputtípusok
(`text`/`email`/`tel`/`radio`/`textarea`) és az oldal címe. A placeholder
szövege elárulja az egyes mezők szerepét, de azt nem, hogy a látogató mit gépelt
be. A tényleges név/email/telefonszám csak a Web3Forms felé kerül elküldésre
(következő szakasz).

### 3.2 Google (GTM-en keresztül)

A GTM-konténer tartalmazza a **Google Ads konverziós** címkét, amelyet a
rendelési űrlap vált ki. Érvényes űrlap beküldésekor az oldal betesz egy
konverziós eseményt a közös adatrétegbe, és a konténer címkéje jelent a Google
Ads felé (fiók: `18452560426`):

| Esemény                                                    | Mikor                                 | Küldött adatok                                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversion` (pagead/viewthrough)                          | Érvényes rendelési űrlap beküldésekor | `value` = a rendelés végösszege **HUF**-ban, `currency_code=HUF`, a címke konverziós `label`-je, valamint a Google által automatikusan hozzáfűzött `auid`, viewport, url/referrer, `gcl_ctr` |
| `form_begin` / `form_submit` (űrlap automatikus eseményei) | Ugyanabban a beküldési pillanatban    | Ugyanaz az url/referrer + `value`; a Google lead-űrlap begin/complete jelzései, amelyeket form-funnel attribúcióhoz használnak                                                               |
| Retargeting / `1p-user-list`, `1p-conversion`              | Ugyanabban a beküldési pillanatban    | Cookie nélküli konverziós tükrök, a `www.google.com` **és** a `www.google.co.uk` felől kiszolgálva                                                                                           |

Az oldal ezt beküldéskor egy `gtag('event', 'conversion', …)` hívásként teszi be
a közös adatrétegbe; maga a konverziós azonosító a konténer
címkekonfigurációjában él (**nincs `AW-…` azonosító a kódbázisban**). A hívásban
szereplő `transaction_id` megegyezik az email-payloaddal, így a konverzió
összeegyeztethető a Web3Forms beküldésével.

### 3.3 Web3Forms (a rendelés továbbítása, nem követés)

Rendelés beküldésekor a vásárló adatai POST kérésként kerülnek az
`api.web3forms.com/submit` címre `FormData`-ként: név, email, telefonszám,
szállítási mód (+ cím, ha szükséges), üzenet, a termékenkénti bontás, a
kiszámított végösszeg, és – a **payload utolsó mezőjeként** – `tranzakcio_id`,
a Google Ads konverziós eseménnyel közös tranzakcióazonosító. Ez az egyetlen
hely, ahol a PII elhagyja a böngészőt.

Sima böngészés során a Meta `PageView`-n kívül nem fut le követési hívás; a
`form_begin`/`form_submit`/`conversion`/`Purchase` együttes csak **érvényes**
rendelésbeküldés esetén fut le.

## 4. Adatvédelmi megjegyzések

- A **PII** (név, email, telefonszám, szállítási cím) csak a Web3Forms felé
  kerül. Nem szerepel sem a Google-, sem a Meta-eseményekben; a Meta
  űrlapeseményei mező-placeholdereket és -típusokat tartalmaznak (a mezők
  _szerepét_), de a beírt értékeket nem.
- **Beállított first-party cookie-k:** a Meta `fbp`-je (a böngésző identitása),
  a Google Ads cookie-i (`auid`, `gcl_ctr`, `_ga_*`, ha egy GA4-stream
  engedélyezve van).
- `localhost` esetén az azonosítók a loopbackre oldódnak fel (`auid`, `fbp` =
  helyi); éles környezetben ezek valódi, látogatónkénti azonosítókká válnak, és
  lehetővé teszik a cross-site párosítást. Cookie-/hozzájárulási banner
  **nincs** – alapértelmezés szerint minden látogatót követ a rendszer.
- Két külső fél kap first-party követési adatot (Google, Meta); mindkettő futtat
  saját, automatikusan gyűjtött űrlapeseményeket is, a fenti kódtól függetlenül.

## 5. Végpontok

```text
www.googletagmanager.com/gtm.js                        # Google Tag Manager konténer (GTM_ID)
connect.facebook.net/en_US/fbevents.js                # Meta Pixel
connect.facebook.net/signals/config/<pixel_id>        # Meta konfiguráció
www.facebook.com/tr/?id=<pixel>&ev=PageView|Purchase  # Meta események (GET)
www.facebook.com/tr?id=<pixel>&ev=PageView&noscript=1 # Meta noscript tartalék
www.facebook.com/tr/                                 # Meta esemény POST-ok
www.googleadservices.com/pagead/conversion/<aid>/     # Google konverzió (GET)
www.googleadservices.com/ccm/conversion/<aid>/        # Google konverzió (GET)
googleads.g.doubleclick.net/pagead/viewthrough…       # view-through + záró POST
www.google.com/{ccm,pagead}/form-data/<aid>           # Google űrlapadatok
www.google.com/rmkt/collect/<aid>/                    # Google retargeting
{www,co.uk}.google.{com,uk}/pagead/1p-{user-list,conversion}/  # cookie nélküli tükrök
web3forms.com/client/script.js                        # Web3Forms kliens (nincs /submit, amíg a vásárlás le van tiltva)
```
