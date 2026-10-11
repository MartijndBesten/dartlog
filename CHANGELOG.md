# Changelog

## 1.6.0 — Regels, hulp en rustiger op elke iPhone

- **Schermindeling iPhone hersteld.** In de geïnstalleerde app vielen het logo en de navigatie van Darters en de uitleg
  onder de statusbalk. Het invoerveld voor de overzetcode (12px) liet de iPhone inzoomen en niet meer uitzoomen,
  waardoor de kop half verdween en scrollen vreemd werd. Nu: safe areas op alle pagina's, invoervelden minimaal 16px,
  vensters scrollen zonder de pagina erachter mee te trekken, en een herstel na het sluiten van het toetsenbord.
- **Meer → Dartregels & afmetingen:** maattekening (bull 1,73 m, werplijn 2,37 m, diagonaal 2,934 m) en de regels van
  501, dubbel uitgooien, bust, scores, legs en sets. Gecontroleerd met de WDF-regels en het DRA Rule Book 2026.
- **Meer → Hulp & feedback:** probleem melden of idee insturen, met optioneel e-mailadres en schermafbeelding. Vooraf zie
  je welke technische gegevens meegaan (versie, toestel, scherm, laatste foutmeldingen van die sessie). Komt binnen in een
  besloten inbox; bescherming tegen spam (alleen vanaf de app, honeypot, limieten per minuut en per dag).
- **Gesproken aanmoedigingen** (Instellingen, standaard uit): de stem van je telefoon bij een persoonlijk record, je eerste
  100+/140+/180, een nieuwe hoogste beurt, een finish van 100+ of op de bull en een duidelijk betere training. Een 180
  krijgt de Engelse dartscall. Nooit bij elke beurt, nooit dezelfde zin twee keer achter elkaar, geen namen.
- **Persoonlijk doel** bij Trainen (vanaf 3 vergelijkbare trainingen): iets boven je recente niveau of je record; op de
  uitslag zie je of je het haalde. Alleen vergeleken met jezelf.
- **Deel je score:** nette scorekaart (zonder naam, gemaakt op je telefoon) en "Daag een vriend uit". Na een record of
  gehaald doel is de knop iets duidelijker, hooguit eens per twee weken.
- **Spelers beheren** (Meer → ✎): naam wijzigen, statistieken wissen met behoud van de speler, of de speler helemaal
  verwijderen, inclusief het Darters-profiel en de gedeelde cijfers online. Andere spelers op het toestel blijven
  ongemoeid; gezamenlijke wedstrijden blijven voor hen bewaard (zonder naam van de verwijderde speler).
- **Delen uitzetten werkt op alle telefoons:** staat het profiel op een andere telefoon uit of daar teruggezet, dan toont
  deze telefoon het ook als uit. Lokale trainingen blijven altijd staan.
- Server: lege profielen worden pas 30 dagen na de laatste wijziging opgeruimd (niet 30 dagen na aanmaken), zodat
  statistieken wissen niet ongemerkt het profiel kost.

## 1.5.1

- Darters, scherm voor ouders/verzorgers: knop en vinkje in de OKKIE.-stijl (waren standaardknoppen) en de
  geldigheid van de link in gewone Nederlandse datum.
- 180-viering: “ONE HUNDRED AND EIGHTY!” viel op telefoons van 360–390px breed buiten het kader; nu staat het getal
  boven de tekst.

## 1.5.0 — Darters

- **Darters** vervangt Mijn vrienden: één overzicht van alle darters die hun cijfers delen (naam, gemiddelde per 3 pijlen,
  trainingen, hoogste beurt, beste 30/60/99; alle tijden, maand, week). Iedereen kan kijken, ook zonder zelf te delen.
- Per speler één schakelaar **Mijn statistieken delen met andere darters**, standaard uit. Aanzetten: naam bevestigen en
  leeftijdsgroep kiezen, geen formulieren of codes. Cijfers worden na elke training vanzelf bijgewerkt, ook als je offline
  trainde. Uitzetten: meteen uit het overzicht en online gewist; lokale trainingen blijven.
- Jonger dan 16: pas zichtbaar (en pas cijfers online) na een ja van een ouder of verzorger via een link, zonder
  ouderaccount; via dezelfde link intrekken wist alles online.
- Groepen, uitnodigingen en oprichterscodes zijn uit de app. Bestaande besloten groepsgegevens blijven bewaard en worden
  nooit automatisch openbaar. Profiel terugzetten op een andere telefoon en de koppelcode blijven werken.

## 1.4.1

- Mijn vrienden: gedeelde cijfers die nog niet verstuurd waren (app direct gesloten, of offline getraind) gaan bij de
  volgende start of zodra er weer internet is alsnog mee. Gevonden bij de livetest van 1.4.0 met een andere telefoon.

## 1.4.0 — Mijn vrienden en de verhuizing naar app.okkiedarts.nl

- **Mijn vrienden**: besloten vriendengroepen. Groep maken, vrienden uitnodigen met een persoonlijke link (delen via WhatsApp of het deelmenu), lid worden, meerdere groepen, verlaten, leden en uitnodigingen beheren.
- Groepsdashboard: beste deze week, meest verbeterd, 30-pijlenchallenge, records deze week; ranglijsten (algemeen, week, challenge, verbetering, records) met stijg-/daalpijlen; spelers naast elkaar vergelijken met balken en een weekgrafiek.
- Per groep kiest een speler expliciet wat hij deelt (gemiddelde, records, challenge). Delen stoppen wist de gedeelde cijfers; profiel verwijderen haalt je uit alle groepen. Losse pijlen blijven altijd op de telefoon.
- De app deelt nu ook de beste 60- en 99-pijlentraining (samenvatting).
- **Vanaf 16 jaar.** Jonger dan 16 staat voorlopig dicht (`MINORS_OPEN`, app én server) tot de juridische toets en DPIA rond zijn: er wordt dan geen profiel gemaakt en niets bewaard. De ouderlink (toestemming per groep, zonder account) is gebouwd en getest, maar staat uit.
- Spelersprofiel (tik op een naam), vergelijken met mij, challenge met resterende dagen. Besloten profielen bewaren online alleen het totaal en de laatste 8 weken.
- Server: productie-API op Cloudflare Workers (`okkie-api`, workers.dev) met D1 in West-Europa; GROUPS_ENABLED aan, openbare registratie dicht, uitnodigingstokens alleen gehasht, toegang uitsluitend voor leden, eenmalige oprichterscode(s) voor het eerste account. CORS: app.okkiedarts.nl, het oude adres en okkiedarts.nl.
- Privacyverklaring bijgewerkt (Mijn vrienden, hosting, jonger dan 16).
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
