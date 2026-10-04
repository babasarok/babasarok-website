# Követés a weboldalunkon

> Ez a fájl a [tracking.md](tracking.md) magyar fordítása; a mérvadó változat az
> angol eredeti.

Mit rögzít ez a weboldal a látogatóiról, mely cégekhez kerülnek ezek az adatok,
és mikor. Ügyfeleknek és marketingkollégáknak írtuk – nem kell hozzá technikai
háttér.

## A lényeg röviden

- **Böngészés:** minden oldalmegtekintés eljut a Google-hoz és a Metához
  (Facebook). Amit az oldalon bárhol beírsz, az nem kerül bele.
- **Rendeléskor:** amikor leadod a rendelést, a Google és a Meta értesül róla,
  hogy vásárlás történt, a rendelés végösszegével (HUF) és a tételek számával
  együtt. A személyes adataid nem részei ennek.
- **A rendelésed maga** (név, e-mail, telefon, szállítási mód és szállítási cím,
  üzenet, tételek, végösszeg) egy Web3Forms nevű űrlapszolgáltatás e-mailben
  továbbítja. Kizárólag ide kerülnek a személyes adataid.
- Nincs cookie-banner: a követés alapértelmezés szerint be van kapcsolva minden
  látogató számára.
- Nem működtetünk saját analitikai szoftvert; a követést teljes egészében a
  Google Tag Manager és a Meta (Facebook) Pixel végzi.

## Ki milyen adatot kap

| Címzett                         | Mit kap                                                                                                                                                                                                                                 | Mikor                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Google (Google Ads)             | Oldalmegtekintések (`PageView`); rendelés esetén `conversion` esemény a rendelés végösszegével (HUF) és standard hirdetési azonosítókkal, plusz form begin/submit jelzések                                                              | Minden oldalon; leadott rendelés esetén |
| Meta (Facebook)                 | Oldalmegtekintések (`PageView`); rendelés esetén `Purchase` esemény a rendelés végösszegével (HUF) és a tételek számával                                                                                                                | Minden oldalon; leadott rendelés esetén |
| Google és Meta (űrlapesemények) | Hogyan épül fel a rendelési űrlap – gombszöveg, mezőfeliratok (pl. `Név *`, `Email cím *`, `Telefonszám`) és beviteli mezőtípusok –, de soha nem az, amit bárki beírt                                                                   | Automatikusan, a rendelési űrlapon      |
| Web3Forms (e-mail szolgáltatás) | A teljes rendelés: név, e-mail, telefon, szállítási mód és szállítási cím, üzenet, termékenkénti bontás, végösszeg, valamint egy rendelésazonosító, amely alapján a rendelést össze tudjuk vetni a hozzá tartozó hirdetési konverzióval | Csak amikor leadod a rendelést          |

## A követés által beállított cookie-k

- A Meta `fbp` cookie-ja – a Facebook számára azonosítja a böngésződet.
- Google Ads cookie-k: `auid`, `gcl_ctr`, valamint a `_ga_*` cookie-k, ha a GA4
  be van kapcsolva.

Az éles weboldalon ezek valódi, látogatónkénti azonosítók, amelyek segítségével
a Google és a Meta a látogatásodat más weboldalakon gyűjtött adataiddal is össze
tudja kapcsolni. (Egy fejlesztő helyi tesztmásolatán ezek nem valós értékek.)

## Adatvédelem dióhéjban

- A személyes adataid (név, e-mail, telefon, szállítási cím) kizárólag ahhoz az
  e-mail szolgáltatáshoz kerülnek, amely eljuttatja hozzánk a rendelésedet –
  soha nem a Google-hoz vagy a Metához.
- A követési események soha nem tartalmazzák, amit az űrlapokba beírtál –
  legfeljebb az űrlap felépítését: gombszöveg, mezőfeliratok és beviteli
  mezőtípusok.
- A rendeléshez kapcsolódó követés csak akkor fut le, ha a rendelési űrlap
  érvényes adatokkal kerül elküldésre; a normál böngészés az oldalmegtekintésen
  kívül semmit nem küld.
- Az általunk küldött eseményeken kívül a Google és a Meta a saját eszközeivel,
  a saját feltételei szerint is gyűjt adatokat; rájuk a saját adatvédelmi
  szabályzatuk vonatkozik.
- Jelenleg nincs cookie- vagy hozzájárulási banner az oldalon, így minden
  látogatót alapértelmezés szerint követünk.
