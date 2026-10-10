# Changelog

## 1.4.0 (in ontwikkeling, branch feature/okkie-vrienden — nog niet live)

- **Mijn vrienden**: besloten vriendengroepen. Groep maken, vrienden uitnodigen met een persoonlijke link (delen via WhatsApp of het deelmenu), lid worden, meerdere groepen, verlaten, leden en uitnodigingen beheren.
- Groepsdashboard: beste deze week, meest verbeterd, 30-pijlenchallenge, records deze week; ranglijsten (algemeen, week, challenge, verbetering, records) met stijg-/daalpijlen; spelers naast elkaar vergelijken met balken en een weekgrafiek.
- Per groep kiest een speler expliciet wat hij deelt (gemiddelde, records, challenge). Delen stoppen wist de gedeelde cijfers; profiel verwijderen haalt je uit alle groepen. Losse pijlen blijven altijd op de telefoon.
- De app deelt nu ook de beste 60- en 99-pijlentraining (samenvatting).
- Server: GROUPS_ENABLED (standaard uit), uitnodigingstokens alleen gehasht, toegang uitsluitend voor leden, oprichterscode voor het eerste account, minderjarigen geblokkeerd tot er verifieerbare ouderlijke toestemming is.
- Spelers, trainingen en offline gebruik blijven ongewijzigd; zonder account werkt OKKIE. zoals altijd.

## 1.3.1

- Interactieve uitleg voor jonge darters (`uitleg/`): vier stappen en een oefenscorebord, zonder dat echte scores veranderen. Bereikbaar vóór de eerste training, op het beginscherm en onder Meer; ook offline.
- Serviceworker bewaart bezochte pagina's onder hun eigen adres, zodat de uitleg nooit de offline app overschrijft.
- Website okkiedarts.nl: animaties en interactie (demo-beurt, inschuiven, toestelherkenning). Geen tweede app-kopie op dat domein; alle links gaan naar de bestaande app. Zonder JavaScript staat alles in de eindstand.
- Community: openbare registratie expliciet dicht (`REGISTRATION_ENABLED = "false"` in de Worker, `REGISTRATION_OPEN = false` in de app), ook als Turnstile al is ingesteld. De ranglijst blijft werken.
- Beheer onbereikbaar zolang Cloudflare Access niet volledig is ingesteld.
- Contactpagina en privacyverklaring op okkiedarts.nl, onder de bedrijfsidentiteit van Denckh. (info@denckh.nl). Elke pagina vermeldt "Ontwikkeld door Denckh." met links naar privacy en contact. `npm run check:launch` blokkeert publicatie zolang er verplichte velden open staan. Bewust geen openbaar adres.
- GitHub Actions: browsertests op iPhone, Android en desktop, websitetests op de gebouwde site en een echte update vanaf de live versie met bestaande spelers, trainingen en een lopende training.

## 1.3.0

- Herinnering na tien nieuwe afgeronde scoretrainingen per lokale speler.
- Extra knop om via het iPhone-/Android-deelmenu de JSON-back-up te bewaren, bijvoorbeeld in iCloud Drive of Google Drive.

- Publieke introductiepagina en installatielink toegevoegd.
- Community met vrijwillige nicknames, openbare scoreaggregaten, ranglijsten en een 30-pijlenweekchallenge.
- Cloudflare D1/Worker API voorbereid voor gedeelde statistieken; eerst cloudaccount, beveiliging en privacycontrole configureren.
- Automatische publicatie van geaggregeerde cijfers na trainingen, uitsluitend als speler zelf delen heeft geactiveerd.
- Nieuwe code staat op een aparte branch. Bestaande trainingsdata en live webadres blijven ongewijzigd.


## 1.2.0 — 2026-10-10

- Merknaam definitief **OKKIE.** (met punt) in titel, logo, manifest en installatienaam.
- Scorevieringen vervangen: 100+!, 140+! en ONE HUNDRED AND EIGHTY! met de echte score, als korte banner bovenin (±1,5 s) die de invoer nooit blokkeert en verdwijnt bij een schermwissel. TON-benamingen verwijderd.
- Meldingen blijven niet meer hangen op het uitslagscherm; pop-ups sluiten eerst meldingen en vieringen.
- Pijlen corrigeren door op een ingevulde pijl te tikken.
- Uitslagscherm rustiger: belangrijkste cijfers eerst, badges en extra statistieken uitklapbaar, vergelijking met de vorige training met hetzelfde aantal pijlen, markering "onvolledig".
- Samen trainen is pas klaar als iedere speler het ingestelde aantal beurten heeft gegooid.
- Meer → installatie-uitleg voor iPhone en Android, met uitleg over lokale opslag.
- Serviceworker: netwerk eerst, offline uit de cache; update-controle (`tools/upgrade-check.mjs`).

## 1.1.0 — 2026-10-10

- Nieuwe merknaam **OKKIE** met onderschrift "Gooi. Scoor. Word beter." (logo, titel, manifest, documentatie). Opgeslagen gegevens en back-ups van OCHE blijven werken.
- Nieuw: samen trainen met 1–4 spelers, om de beurt 3 pijlen, automatisch naar de volgende speler, ranglijst en per speler een eigen training.
- Nieuw: scores uit een andere app toevoegen (10 DartCounter-trainingen of zelf invullen), datum achteraf aan te passen.
- Statistieken: trainingen zonder datum alleen in de grafiek "Per training" (label DC).

## 1.0.0 — 2026-10-10

Eerste volledige versie onder de naam **OCHE** (voorheen Dartlog).

- Nieuw: snelle invoer per pijl met DOUBLE/TRIPLE-knoppen, typen als alternatief, laatste pijl wissen.
- Nieuw: scoretraining 30/60/99/vrij/eigen aantal, pauzeren en hervatten (ook na herstart).
- Nieuw: rond de klok.
- Nieuw: 301/501 voor 1–4 spelers, legs (best of 3–9), double-/straight-out, bust, uitgooi-advies.
- Nieuw: statistieken met grafiek per training/dag/week/maand, trendlijn, laatste-10-vergelijking, trefferkaart, records en badges.
- Nieuw: meerdere spelersprofielen, geschiedenis met detail en verwijderen.
- Nieuw: back-up exporteren/importeren met validatie; automatische migratie van Dartlog v1.
- Nieuw: installeerbare PWA met offline-ondersteuning, eigen logo en app-icoon.
- Unit-tests (Node) en browsertests (Playwright) voor de belangrijkste scenario's.
