# OKKIE. · darttrainer

**Gooi. Scoor. Word beter.**

**OKKIE.** is een persoonlijke darttrainer voor telefoon en computer. De naam komt van *oche* (uitgesproken als okkie): de werplijn waar je achter staat bij darts. Gooi drie pijlen, tik ze in, en zie of je beter wordt.

Ontwikkeld door **Denckh.**

🎯 **Online:** https://martijndbesten.github.io/dartlog/

## Functies

- **Scoretraining**: 30, 60 of 99 pijlen, vrij trainen of een eigen aantal beurten. Per pijl invoeren met grote knoppen (DOUBLE/TRIPLE + 1–20, 25, BULL, MIS) of typen (`T20 5 D10`).
- **Samen trainen**: 1 tot 4 spelers (vrienden, familie) gooien om de beurt 3 pijlen; OKKIE springt automatisch naar de volgende naam, toont een ranglijst en bewaart voor iedereen een eigen training.
- **Scores uit een andere app**: de 10 DartCounter-scoretrainingen met één tik toevoegen, of zelf een eindstand invullen (pijlen, totaal, hoogste beurt, datum). Deze tellen mee in gemiddelden en records, niet in de trefferkaart.
- **Rond de klok**: 1 t/m 20 en de bull, in zo min mogelijk pijlen.
- **Wedstrijd 301/501**: 1–4 spelers, 1 leg of best of 3/5/7/9, double-out of straight-out, bust-regels, uitgooi-advies, stoppen en later hervatten.
- **Statistieken**: gemiddelde per 3 pijlen (altijd gewogen over alle pijlen), beste/slechtste training, 100+/140+/180, grafiek per training/dag/week/maand met trendlijn, "laatste 10" vergelijken, filter op 30/60/99/vrij.
- **Trefferkaart**: dartbord dat laat zien welke vakken je het vaakst raakt (enkel/dubbel/triple).
- **Records en badges**: persoonlijke records en 19 badges om te verdienen, met een korte viering bij 100+, 140+ en 180 (ONE HUNDRED AND EIGHTY!).
- **Uitslag**: gemiddelde, totaal, hoogste beurt, records en een vergelijking met je vorige training met hetzelfde aantal pijlen; badges en extra statistieken uitklapbaar.
- **Meerdere spelers** op één toestel, elk met eigen statistieken.
- **Geschiedenis**: elke training en wedstrijd terugkijken (alle pijlen), verwijderen met bevestiging.
- **Back-up**: exporteren naar JSON en terugzetten (samenvoegen of vervangen), met validatie.
- **Installeerbaar (PWA)** en werkt offline.

## Op de telefoon zetten

- **Installeren op iPhone**: open OKKIE in **Safari**, gebruik **Delen** en kies **Zet op beginscherm**.
- **Installeren op Android**: open OKKIE in **Chrome** en kies via het menu **App installeren** of **Toevoegen aan startscherm**.

Na installatie opent OKKIE als eigen app (naam: OKKIE.) en werkt hij offline.

## Waar staan de gegevens?

Alles staat lokaal in de browser van het toestel (`localStorage`, sleutel `oche.data`; die naam is van de eerste merknaam en blijft bewust hetzelfde zodat bestaande trainingen bewaard blijven). Er is geen account en er gaat niets naar een server.
Gevolg: gegevens synchroniseren niet tussen toestellen en verdwijnen als je de websitegegevens van de browser wist. Maak daarom af en toe een back-up via **Meer → Back-up downloaden**.
Gegevens uit de eerste Dartlog-versie (`dartlog.v1`) worden automatisch overgezet.

## Lokaal starten

```bash
npm install          # alleen nodig voor de tests
npm start            # http://localhost:4173
```

Er is geen build-stap: het zijn gewone HTML-, CSS- en JavaScript-bestanden.

## Testen

 controleert een echte update (oude versie → nieuwe) op hetzelfde adres: lopende en afgeronde trainingen, cache en offline gebruik.

```bash
npm test             # unit-tests (spelregels, statistiek, opslag, migratie, back-ups)
npm run test:e2e     # browsertests met Playwright (iPhone-, Android- en desktopformaat)
```

De browsertests gebruiken de geïnstalleerde Chrome (`PW_CHANNEL=chrome`, standaard).

## Publiceren

De site draait op **GitHub Pages** vanaf de branch `main` (map `/`). Elke push naar `main` wordt binnen een minuut live.
Verhoog bij een release `VERSION` in `sw.js`, zodat telefoons de nieuwe bestanden ophalen.

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
| `sw.js`, `manifest.webmanifest` | PWA en offline |

Uitbreiden: nieuwe spelregels en berekeningen in `logic.js` (met een test in `tests/unit`), een nieuw scherm als functie in `VIEWS` in `app.js`.
