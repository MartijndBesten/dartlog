# OKKIE. later als app voor Android en iPhone

OKKIE. blijft voorlopig een PWA (app.okkiedarts.nl). Er zijn géén appwinkel-, account- of abonnementsfuncties gebouwd.
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

Ids zijn UUID's (`crypto.randomUUID`), tijden ISO-8601 in UTC: geen botsingen bij samenvoegen tussen toestellen.

## Waar je op moet letten bij een echte app

- **Opslag is per adres.** Een app in een wrapper (Capacitor of TWA) heeft eigen opslag, los van Safari/Chrome en van
  app.okkiedarts.nl. Gegevens gaan er dus niet vanzelf heen: de eerste start van de app moet de bestaande route gebruiken
  (overzetcode of back-up), net als bij de verhuizing naar app.okkiedarts.nl (VERHUIZING.md).
- **Android eerst via TWA** (Trusted Web Activity) op app.okkiedarts.nl: dezelfde origin, dus dezelfde opslag als de
  geïnstalleerde PWA in Chrome. Vereist `/.well-known/assetlinks.json` op app.okkiedarts.nl.
- **iPhone vraagt een wrapper** (bijv. Capacitor) met eigen opslag: overzetten via code/back-up is dan nodig. Spraak
  (`speechSynthesis`), delen (`navigator.share`) en trillen werken daar via de webview of een plugin.
- **Geen extra persoonsgegevens**: de app werkt zonder account; houd dat zo, tenzij er een bewust besluit komt.
- Versie verhogen op drie plekken (sw.js, js/app.js, package.json); de test `release.test.js` bewaakt dat.
