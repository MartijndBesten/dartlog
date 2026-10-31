# OKKIE. later als app voor Android en iPhone

OKKIE. is een PWA (app.okkiedarts.nl) en sinds 1.8.0 ook een **iPhone-app** (Capacitor, TestFlight): zie **IOS-APP.md**.
Er zijn géén account- of abonnementsfuncties gebouwd. Android volgt later (TWA, zie hieronder).
Deze notitie legt vast wat er al klaarligt, zodat een overstap later zonder dataverlies kan.

## Wat is al overdraagbaar

| Onderdeel | Waar | Waarom het overdraagbaar is |
|---|---|---|
| Alle gegevens | `localStorage` sleutel `oche.data`, `data.version = 2` (`js/store.js`) | Eén JSON-object: spelers, trainingen (alle pijlen), wedstrijden, instellingen. Gevalideerd en gemigreerd in `parseBackup`/`load`. |
| Back-upbestand | `makeBackup`: `{ app: 'okkie', format: 1, appVersion, exportedAt, data }` | Zelfde formaat op elk toestel; samenvoegen voegt alleen ontbrekende id's toe (niets dubbel). |
| Overzetcode | `js/transfer.js`, prefix `OKKIE-OVERZETTEN-1:` | Kopiëren en plakken tussen twee "plekken" (browser → geïnstalleerde app, oud adres → nieuw adres). Werkt ook naar een toekomstige native app. |
| Verwijderde items | `rememberRemoved` (in `data`) | Overzetten of samenvoegen haalt gewiste trainingen/spelers niet terug. |
| Online profiel (Darters) | profielcode + herstelcode (`okkie.community.v1`) | Accountcontinuïteit zonder e-mail of wachtwoord: met de herstelcode zet je het profiel op elk toestel terug. |
| Spelregels en statistiek | `js/logic.js`, `js/motivation.js` | Zonder DOM, met unittests; 1-op-1 herbruikbaar. |
| Weergave van statistieken | `data.settings.statView` (`js/stat-prefs.js`), per speler `{ one: [...], many: [...] }` | Alleen aanwezig als iemand iets aanpaste; ontbreekt = standaardweergave. Hoort bij de instellingen (in de back-up), niet bij spelers of trainingen, dus overzetten en samenvoegen veranderen er niets door. |

Ids zijn UUID's (`crypto.randomUUID`), tijden ISO-8601 in UTC: geen botsingen bij samenvoegen tussen toestellen.

## Waar je op moet letten bij een echte app

- **Opslag is per adres.** Een app in een wrapper (Capacitor of TWA) heeft eigen opslag, los van Safari/Chrome en van
  app.okkiedarts.nl. Gegevens gaan er dus niet vanzelf heen: de eerste start van de app moet de bestaande route gebruiken
  (overzetcode of back-up), net als bij de verhuizing naar app.okkiedarts.nl (VERHUIZING.md).
- **Android eerst via TWA** (Trusted Web Activity) op app.okkiedarts.nl: dezelfde origin, dus dezelfde opslag als de
  geïnstalleerde PWA in Chrome. Vereist `/.well-known/assetlinks.json` op app.okkiedarts.nl.
- **iPhone: gedaan in 1.8.0** met Capacitor (IOS-APP.md). Eigen opslag (capacitor://localhost) plus een duurzame kopie
  in de app; overstappen via overzetcode of back-up. Delen en trillen via plugins, spraak via de webview.
- **Geen extra persoonsgegevens**: de app werkt zonder account; houd dat zo, tenzij er een bewust besluit komt.
- **Geen aankopen in de app en geen steun- of betaalfunctie** (besluit eigenaar, 1.6.3): OKKIE. blijft helemaal gratis.
  Komt er ooit toch een betaalweg, dan gelden in een appwinkelversie de regels van Apple en Google.
- Versie verhogen op drie plekken (sw.js, js/app.js, package.json); de test `release.test.js` bewaakt dat.
