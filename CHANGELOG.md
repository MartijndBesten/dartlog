# Changelog

## 1.4.0 — Mijn vrienden en de verhuizing naar app.okkiedarts.nl

- **Mijn vrienden**: besloten vriendengroepen. Groep maken, vrienden uitnodigen met een persoonlijke link (delen via WhatsApp of het deelmenu), lid worden, meerdere groepen, verlaten, leden en uitnodigingen beheren.
- Groepsdashboard: beste deze week, meest verbeterd, 30-pijlenchallenge, records deze week; ranglijsten (algemeen, week, challenge, verbetering, records) met stijg-/daalpijlen; spelers naast elkaar vergelijken met balken en een weekgrafiek.
- Per groep kiest een speler expliciet wat hij deelt (gemiddelde, records, challenge). Delen stoppen wist de gedeelde cijfers; profiel verwijderen haalt je uit alle groepen. Losse pijlen blijven altijd op de telefoon.
- De app deelt nu ook de beste 60- en 99-pijlentraining (samenvatting).
- Voor alle leeftijden: alleen voornaam en leeftijdsgroep (16+ of jonger). Jonger dan 16: een ouder of verzorger geeft per groep toestemming via een link, zonder account (ook voor een eigen groep of meer delen), en kan die per groep via dezelfde link intrekken; zonder groep met toestemming wordt het online profiel gewist. Geen chat, berichten of foto’s.
- Spelersprofiel (tik op een naam), vergelijken met mij, challenge met resterende dagen. Besloten profielen bewaren online alleen het totaal en de laatste 8 weken.
- Server: GROUPS_ENABLED (standaard uit), uitnodigingstokens alleen gehasht, toegang uitsluitend voor leden, eenmalige oprichterscode(s) voor het eerste account.
- **Darten op een andere telefoon**: maak op je eigen telefoon een koppelcode (8 tekens, 7 dagen, één training); je vriend vult hem in bij Trainen. Na de training gaat alleen de samenvatting naar je eigen profiel; je eigen telefoon haalt hem op en telt hem mee. Werkt ook als de telefoon van je vriend even offline is; nooit dubbel. De code geeft geen toegang tot je profiel.
- Bescherming: de server weigert dat een telefoon ongemerkt minder trainingen online zet dan er al staan (bijv. na herstel op een lege telefoon); alleen bewust verwijderen mag dat. Een naam alleen koppelt nooit aan iemands online profiel.
- Spelers, trainingen en offline gebruik blijven ongewijzigd; zonder account werkt OKKIE. zoals altijd.
- Verhuizing aangekondigd (`PROD.open = true`): het oude adres toont "OKKIE. verhuist naar app.okkiedarts.nl" met
  "Zet mijn trainingen over" op Home en onder Meer. Nooit doorverwijzen, nooit wissen; het oude adres blijft werken.
- Nieuwe bezoeker op het oude adres (lege app): verwijzing "Open app.okkiedarts.nl"; hier beginnen kan nog steeds.
- Website (homepage, privacy, contact) en de uitlegpagina openen de app op app.okkiedarts.nl.
- Serviceworker: een nieuwe versie haalt haar bestanden rechtstreeks van de server, niet uit de browsercache van
  10 minuten (bij de update naar 1.3.4 kon tijdelijk een oude app.js naast nieuwe bestanden in de offline-opslag staan).
- Bevat ook alles van 1.3.4 (overzetcode en controle per record), 1.3.3 en 1.3.2 (merk en vormgeving).

## 1.3.4 (live 11 oktober 2026)
- Verhuizing naar app.okkiedarts.nl voorbereid, standaard **uit** (`PROD.open = false` in `js/transfer.js`). Zie VERHUIZING.md.
  Automatisch overzetten tussen twee vensters, overzetcode (kopiëren en plakken, ook vanuit de iPhone-app op het beginscherm) en het back-upbestand.
  Nooit wissen, nooit doorverwijzen, samenvoegen op ID, controle op inhoud (vingerafdruk) en per speler (trainingen, pijlen, punten, gemiddelde).
  Online profielen gaan mee. Lopende training gaat mee zonder dubbel te tellen. Gelijke namen alleen op verzoek samenvoegen.
- Overzetcode ook los te gebruiken: Meer → Back-up → Overzetcode maken / Code invoeren (bijv. van Safari naar de app op het beginscherm).
- Back-up terugzetten toont hetzelfde controleverslag en neemt een lopende training mee als er hier geen loopt.
- Installatiebegeleiding voor nieuwe gebruikers, alleen op app.okkiedarts.nl: compact advies met "OKKIE. installeren" en "Eerst proberen",
  Android-installatieprompt, echte iPhone-stappen, eerst trainingen meenemen als je al hebt gegooid. Niet in de geïnstalleerde app en niet voor bestaande gebruikers.
- `tools/build-app-site.mjs`: aparte publicatie voor app.okkiedarts.nl (met CNAME), zonder het oude adres te raken.

## 1.3.3

- Licht thema: goud voor records en badges donkerder (contrast 4,4 → 5,7, WCAG AA).
- Extra regressietests: 60/99 pijlen, eigen lengte, rond de klok, 301 straight out, dezelfde voornaam, kleurcontrast, verminderde beweging.

## 1.3.2

- Eén merk op app en website: de O met dubbele limoenring en pijl, het woordmerk KKIE als vectorpad (overal gelijk, ook op Android) en de ronde OKKIE.-stip. Nieuwe app-iconen, favicons (16/32/48, .ico, SVG), Apple Touch Icon en maskable Android-icoon, allemaal uit `js/brand.js` (`npm run icons`).
- WhatsApp- en social-voorvertoning: Open Graph en Twitter Card op alle websitepagina's en in de app, met een deelafbeelding van 1200 x 630 (48 kB).
- **Nodig een vriend uit** op het beginscherm en onder Meer: via WhatsApp, het deelmenu van de telefoon of kopiëren. Deelt alleen een link naar okkiedarts.nl, nooit namen of scores; los van groepsuitnodigingen in Mijn vrienden.
- Rustiger vormgeving: limoen als vaste interactiekleur (knoppen, keuzes, navigatie), goud alleen voor records en badges, geen rode of gouden vlakken meer zonder betekenis. Eigen lijniconen in plaats van emoji in navigatie en knoppen. Minder randen, één radius-schaal, compacte trainingskeuze op één rij.
- Statistieken: grafiek wordt op de echte schermbreedte getekend (geen vervormde labels), legenda voor gemiddelde en trend, gemiddelde als hoofdcijfer.
- Speelscherm op kleine telefoons (iPhone SE, Safari met werkbalken): de onderste cijferrij schoof onder 25/BULL/MIS en gaf mis-tikken. Toetsen krimpen nu mee tot minimaal 34 px en overlappen nooit; compacte opmaak onder 620 px hoogte.
- Geen browser-linkpaars meer (ook niet bij Community op het beginscherm). "Nieuw? Zo werkt OKKIE." alleen nog bij minder dan drie trainingen.
- Makersvermelding volgens de Denckh-merkregel: overal het officiële Denckh-signatuurlogo met krul (ongewijzigde merkassets), met de kleine tekst "Ontwikkeld door". Website (homepage, uitleg, privacy, contact), communitypagina en app (welkomstscherm, Meer; lichte en donkere variant per thema).
- Het eerder toegevoegde pijltje ↗ achter Denckh. is weer weg.

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
