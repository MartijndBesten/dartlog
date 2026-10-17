# OKKIE. · darttrainer

**Gooi. Scoor. Word beter.**

**OKKIE.** is een persoonlijke darttrainer voor telefoon en computer. De naam komt van *oche* (uitgesproken als okkie): de werplijn waar je achter staat bij darts. Gooi drie pijlen, tik ze in, en zie of je beter wordt.

Ontwikkeld door **Denckh.**

🎯 **App:** https://app.okkiedarts.nl/ · **Website:** https://okkiedarts.nl/ · het oude adres https://martijndbesten.github.io/dartlog/ stuurt sinds 1.6.2 door naar de app

- `uitleg/`: uitleg voor kinderen en beginners met een oefenbeurt die niets opslaat.
- `community/`: Darters, het openbare overzicht van vrijwillig gedeelde cijfers (Cloudflare Worker in `cloud/`).
- `ontdek/`: de website okkiedarts.nl (`node tools/build-public-site.mjs`). Zie VERHUIZING.md en cloud/INFRASTRUCTUUR.md.
- Later naar Android/iPhone als echte app: zie TOEKOMST-APPS.md.

## Functies

- **Scoretraining**: 30, 60 of 99 pijlen, vrij trainen of een eigen aantal beurten. Per pijl invoeren met grote knoppen (DOUBLE/TRIPLE + 1–20, 25, BULL, MIS) of typen (`T20 5 D10`).
- **Samen trainen**: 1 tot 4 spelers (vrienden, familie) gooien om de beurt 3 pijlen; OKKIE springt automatisch naar de volgende naam, toont een ranglijst en bewaart voor iedereen een eigen training.
- **Scores uit een andere app**: de 10 DartCounter-scoretrainingen met één tik toevoegen, of zelf een eindstand invullen (pijlen, totaal, hoogste beurt, datum). Deze tellen mee in gemiddelden en records, niet in de trefferkaart.
- **Rond de klok**: 1 t/m 20 en de bull, in zo min mogelijk pijlen.
- **Wedstrijd 301/501**: 1–4 spelers, 1 leg of best of 3/5/7/9, double-out of straight-out, bust-regels, uitgooi-advies, stoppen en later hervatten. Een tegenstander met eigen OKKIE. koppel je met zijn koppelcode (Speler toevoegen); zijn uitslag en wedstrijdcijfers gaan na afloop naar zijn eigen telefoon, ook als je offline speelde.
- **Statistieken**: gemiddelde per 3 pijlen (altijd gewogen over alle pijlen), beste/slechtste training, 100+/140+/180, grafiek per training/dag/week/maand met trendlijn, "laatste 10" vergelijken, filter op 30/60/99/vrij.
- **Trefferkaart**: dartbord dat laat zien welke vakken je het vaakst raakt (enkel/dubbel/triple).
- **Records en badges**: persoonlijke records en 39 badges om te verdienen, met een korte viering bij 100+, 140+ en 180 (ONE HUNDRED AND EIGHTY!).
- **Persoonlijk doel**: bij Trainen een doel net boven je recente niveau (of je record), alleen vergeleken met jezelf.
- **Gesproken aanmoedigingen** (standaard uit): de stem van de telefoon bij een record, je eerste 100+/140+/180, een finish van 100+ en een duidelijk betere training; Engelse call bij 180.
- **Delen**: OKKIE. aanraden (link naar okkiedarts.nl), een scorekaart van je training (zonder naam) en "Daag een vriend uit".
- **Dartregels & afmetingen**: maattekening (1,73 / 2,37 / 2,934 m) en de regels van 501, gecontroleerd met WDF en DRA.
- **Hulp & feedback**: probleem of idee insturen met schermafbeelding, naar een besloten inbox (cloud/FEEDBACK.md).
- **Uitslag**: gemiddelde, totaal, hoogste beurt, records en een vergelijking met je vorige training met hetzelfde aantal pijlen; badges en extra statistieken uitklapbaar.
- **Meerdere spelers** op één toestel, elk met eigen statistieken. Per speler: naam wijzigen, statistieken wissen of helemaal verwijderen (ook online bij Darters), zonder andere spelers te raken.
- **Geschiedenis**: elke training en wedstrijd terugkijken (alle pijlen), verwijderen met bevestiging.
- **Back-up**: exporteren naar JSON en terugzetten (samenvoegen of vervangen), met validatie; herinnering na tien afgeronde trainingen per speler en bewaren via de deelfunctie (Bestanden/iCloud Drive). Overzetcode voor een andere telefoon of van Safari naar de geïnstalleerde app.
- **Installeerbaar (PWA)** en werkt offline.

## Op de telefoon zetten

- **Installeren op iPhone**: open OKKIE in **Safari**, gebruik **Delen** en kies **Zet op beginscherm**.
- **Installeren op Android**: open OKKIE in **Chrome** en kies via het menu **App installeren** of **Toevoegen aan startscherm**.

Na installatie opent OKKIE als eigen app (naam: OKKIE.) en werkt hij offline.

## Waar staan de gegevens?

Alles staat lokaal in de browser van het toestel (`localStorage`, sleutel `oche.data`; die naam is van de eerste merknaam en blijft bewust hetzelfde zodat bestaande trainingen bewaard blijven). Er is geen account. Alleen wie bij Darters delen aanzet, stuurt samengevatte cijfers naar de server; Hulp & feedback stuurt alleen wat je zelf instuurt.
Gevolg: gegevens synchroniseren niet tussen toestellen en verdwijnen als je de websitegegevens van de browser wist. Maak daarom af en toe een back-up via **Meer → Back-up downloaden**.
Gegevens uit de eerste Dartlog-versie (`dartlog.v1`) worden automatisch overgezet.

## Lokaal starten

```bash
npm install          # alleen nodig voor de tests
npm start            # http://localhost:4173
```

Er is geen build-stap: het zijn gewone HTML-, CSS- en JavaScript-bestanden.

## Testen

```bash
npm test             # unit-tests (spelregels, statistiek, opslag, migratie, back-ups)
npm run test:e2e     # browsertests met Playwright (iPhone-, Android- en desktopformaat)
```

`node tools/upgrade-check.mjs <map-met-oude-versie>` controleert een echte update (oude versie → nieuwe) op hetzelfde adres: lopende en afgeronde trainingen, cache en offline gebruik.

De browsertests gebruiken de geïnstalleerde Chrome (`PW_CHANNEL=chrome`, standaard).

## Publiceren

Drie GitHub Pages-sites, samen in één ronde: `node tools/build-app-site.mjs` → repository okkie-app (app.okkiedarts.nl), branch `main` van deze repository (oude adres) en `node tools/build-public-site.mjs` → okkiedarts-site (okkiedarts.nl). Worker: `cloud/` (wrangler, `--env production`).
Verhoog bij een release `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` en `package.json` (de test controleert dat ze gelijk zijn), zodat telefoons de nieuwe bestanden ophalen.

## Opbouw

| Bestand | Inhoud |
|---|---|
| `js/logic.js` | Spelregels en berekeningen (pijlen, X01, bust, uitgooi-advies, gemiddelden, perioden) |
| `js/store.js` | Gegevensformaat (versie 2), migratie, validatie, back-up |
| `js/achievements.js` | Badges, berekend uit de echte gegevens |
| `js/board.js` / `js/chart.js` | SVG-trefferkaart en grafiek |
| `js/brand.js` | Logo en app-icoon (`npm run icons` maakt de PNG's) |
| `js/imports.js` | De DartCounter-scores (van screenshots) |
| `js/app.js` | Schermen en bediening |
| `js/rules.js` | Dartregels & afmetingen (tekst en maattekening) |
| `js/feedback.js` | Hulp & feedback: formulier, technische gegevens, verkleinen van schermafbeeldingen |
| `js/speech.js` / `js/motivation.js` | Gesproken aanmoedigingen en het persoonlijke doel (getest in `tests/unit/motivation.test.js`) |
| `js/share-card.js` | Scorekaart om een training te delen |
| `js/community-sync.js`, `js/guest-sync.js`, `js/transfer.js` | Darters-synchronisatie, spelen op een andere telefoon, overzetten |
| `sw.js`, `manifest.webmanifest` | PWA en offline |

Uitbreiden: nieuwe spelregels en berekeningen in `logic.js` (met een test in `tests/unit`), een nieuw scherm als functie in `VIEWS` in `app.js`.
