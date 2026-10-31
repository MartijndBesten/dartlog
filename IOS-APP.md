# OKKIE. als iPhone-app

Stand: 31 oktober 2026, versie 1.8.0, branch `claude/ios-app`. De bestaande webapp (dezelfde code als
app.okkiedarts.nl) is met **Capacitor 8** verpakt als echte iOS-app. De PWA en de website blijven los daarvan werken.

| | |
|---|---|
| Appnaam (beginscherm) | **OKKIE.** |
| Bundle-ID | `nl.denckh.okkie` |
| Team-ID | `W9H8R7BPDN` (individuele ontwikkelaar) |
| iOS | 15 of nieuwer, alleen iPhone, alleen staand |
| Bouwen | GitHub Actions, `macos-26`-runner (gratis voor deze openbare repository): `.github/workflows/ios.yml` |
| App Store-teksten | `appstore/APPSTORE-TEKSTEN.md`, privacylabels `appstore/PRIVACY-APPSTORE.md`, screenshots `appstore/screenshots/6.9/` |

## Waarom Capacitor (en geen herbouw)

- Alle schermen, spelregels, statistieken en tests blijven dezelfde code. Geen tweede app om bij te houden.
- De webbestanden zitten **in** de app (`dist-ios` → `ios/App/App/public`): trainen en wedstrijden werken zonder
  internet, ook bij de eerste start. Er wordt geen website geladen (richtlijn 4.2/2.5.2: geen "website-wrapper").
- Wat de webview niet goed kan, doet een officiële plugin: bestanden (duurzame kopie), deelmenu, Haptics,
  statusbalk, startscherm, app-status. Geen bundler nodig: de plugins zitten in `window.Capacitor.Plugins`.
- Alternatieven bekeken: alleen PWA (geen App Store), React Native/Swift (alles opnieuw bouwen, dubbel onderhoud).

## Opbouw

| Onderdeel | Bestand |
|---|---|
| App-laag (doet niets op het web) | `js/native.js` |
| Opstarten: eerst de kopie controleren, dan de app | `js/boot.js` (index.html laadt nu boot.js) |
| Webbestanden voor de app | `tools/build-ios-web.mjs` (zelfde lijst als app.okkiedarts.nl: `tools/app-files.mjs`) |
| Capacitor-instellingen | `capacitor.config.json` |
| Xcode-project (Swift Package Manager, geen CocoaPods) | `ios/App` |
| Icoon en startscherm | `tools/make-ios-assets.mjs` (uit `js/brand.js`) |
| Privacymanifest | `ios/App/App/PrivacyInfo.xcprivacy` |
| Rooktest in de simulator | `tools/ios/smoke.sh` |
| Ondertekenen voor TestFlight | `tools/ios/asc-signing.mjs`, `tools/ios/manual-signing.py` |

Werken op een Mac: `npm ci && npm run ios:sync && npx cap open ios`, dan in Xcode op ▶︎ drukken.

## Gegevens: nooit iets kwijt

**Belangrijkste regel:** de app draait op `capacitor://localhost`. localStorage hoort bij die herkomst.
`server.hostname` en `iosScheme` in `capacitor.config.json` **nooit wijzigen** (de test `ios.test.js` bewaakt dit):
anders begint elke geïnstalleerde app leeg.

1. **In de app:** alles staat in localStorage (`oche.data` en de `okkie.*`-sleutels, zelfde formaat als de PWA).
2. **Duurzame kopie** (`js/native.js`): na elke wijziging (na 0,8 s, en meteen als de app naar de achtergrond gaat)
   gaan alle OKKIE.-sleutels naar `Library/OKKIE/opslag-a.json` of `-b.json`, om en om, met een volgnummer.
   Een half geschreven bestand raakt dus nooit beide. Library zit in de iCloud-/computerback-up en wordt door iOS
   niet opgeruimd zoals een cache.
3. **Bij het starten** (`js/boot.js`): ontbreekt `oche.data` maar staat het wel in de kopie, dan zet de app eerst
   alle ontbrekende sleutels terug en start daarna pas. Staat `oche.data` er wel, dan is localStorage leidend en wordt
   niets overschreven. Online profielen en koppelcodes gaan mee (ze staan in dezelfde kopie).
4. **Updates:** een nieuwe versie gebruikt dezelfde herkomst en dezelfde kopie; het gegevensformaat (`version: 2`) en de
   migraties in `store.js` blijven leidend, net als in de PWA.
5. **Eigen back-up:** Meer → *Back-up bewaren in Bestanden* (iOS-deelmenu → Bewaar in Bestanden/iCloud Drive) en
   *Back-up terugzetten* (bestandskiezer). Zelfde bestand als in de PWA, dus ook terug te zetten in Safari.

Getest: `tests/unit/native.test.js` (kopie, volgnummers, halve bestanden, wissen en terugzetten met echte gegevens),
`tests/e2e/ios-app.spec.js` (nagebootste app in Chromium) en in de **echte iOS-simulator** (`tools/ios/smoke.sh`):
starten met alleen de kopie → speler terug; kopie weg → app schrijft hem opnieuw; webviewopslag gewist → alles terug.

### Overstappen van Safari/beginscherm naar de app

De app heeft eigen opslag, los van Safari en van OKKIE. op het beginscherm. Bij de eerste start staat bovenaan
**Al eerder OKKIE. gebruikt? → Trainingen ophalen**. Twee routes (bestaande code, `js/transfer.js`):

- **Overzetcode** (aanbevolen): oude OKKIE. → Meer → *Overzetcode maken* → *Kopieer de code* → in de app
  *Trainingen ophalen* → *Plakken* → *Controleren* → *Overzetten*. Online profiel alleen mee als je het vinkje zet.
  Samenvoegen gaat op ID: twee keer overzetten geeft nooit iets dubbel. Het verslag controleert elke training.
- **Back-upbestand:** oude OKKIE. → *Bewaar via Delen / iCloud* → in de app *Kies het bestand*.

De oude PWA wordt nooit gewist; wie wil, kan beide blijven gebruiken (gegevens synchroniseren niet).

## iOS-gedrag: wat is gecontroleerd

| Onderwerp | Hoe in de app | Status |
|---|---|---|
| Offline | Alle bestanden in de app; geen serviceworker in de app | simulator ✔ |
| Opslag | localStorage + duurzame kopie | simulator ✔ (ook na wissen) |
| Delen (OKKIE. aanraden, scorekaart, uitdagen) | `navigator.share` → native deelmenu | nagebootst ✔, **op iPhone testen** |
| Back-up exporteren | Deelmenu → Bewaar in Bestanden | nagebootst ✔, **op iPhone testen** |
| Back-up/overzetcode importeren | Bestandskiezer (`<input type=file>`), plakken | **op iPhone testen** |
| Spraak | `speechSynthesis` van de webview (WKWebView) | **op iPhone testen** (stille modus!) |
| Trillen | Haptics (navigator.vibrate bestaat niet op iOS) | nagebootst ✔ |
| Statusbalk | Volgt het thema (donker/licht) | nagebootst ✔ |
| Veilige randen | `viewport-fit=cover` + `env(safe-area-inset-*)` (al in de CSS) | simulator-screenshot |
| Toetsenbord | Standaard webview (geen Keyboard-plugin): zelfde gedrag als Safari | **op iPhone testen** (typvak bij trainen) |
| Navigatie | Eigen terugknoppen; externe links openen in Safari | **op iPhone testen** |
| Camera/foto's | Alleen bij feedbackfoto en "Bewaar afbeelding" (teksten in Info.plist) | **op iPhone testen** |

## Server (Darters, Hulp & feedback, dagteller)

De webview stuurt `Origin: capacitor://localhost`. Die staat in `cloud/wrangler.toml` (test: `cloud/tests/ios-origin.test.js`).
**Nog te doen, na akkoord eigenaar:** Worker opnieuw deployen (`cd cloud && npx wrangler deploy --env production`).
Tot dan werkt de app volledig, alleen Darters/feedback/dagteller geven in de app "niet bereikbaar".

## Bouwen en TestFlight

### Elke push (automatisch)

`.github/workflows/ios.yml` → job **Compileren en rooktest**: `npm ci`, `build-ios-web`, `cap sync ios`, `xcodebuild`
voor de simulator en `tools/ios/smoke.sh`. Schermafbeeldingen en logs staan als artefact bij de run.

### TestFlight (eenmalige voorbereiding door de eigenaar)

1. **API-sleutel:** App Store Connect → Gebruikers en toegang → Integraties → App Store Connect API → *Team Keys* →
   **+** → naam `OKKIE GitHub`, toegang **Admin** (nodig om het tijdelijke distributiecertificaat te maken).
   Download `AuthKey_XXXX.p8` (kan maar één keer). Noteer **Key ID** en **Issuer ID**.
2. **App aanmaken:** App Store Connect → Apps → **+** → Nieuwe app: iOS, naam `OKKIE. Darttrainer`, taal
   Nederlands, bundle-ID `nl.denckh.okkie` (staat er niet? dan eerst op developer.apple.com → Identifiers → **+** →
   App IDs → Explicit `nl.denckh.okkie`, of draai stap 4 één keer: het script maakt het bundle-ID zelf aan), SKU `okkie-ios`.
3. **GitHub-secrets:** github.com/MartijndBesten/dartlog → Settings → Secrets and variables → Actions → *New repository secret*:
   `ASC_KEY_ID`, `ASC_ISSUER_ID` en `ASC_KEY_P8` (de hele inhoud van het .p8-bestand, inclusief BEGIN/END-regels).
4. **Bouwen en uploaden:** Actions → **OKKIE iPhone-app** → *Run workflow* → branch kiezen → vinkje **TestFlight** →
   Run. Duurt ±15 minuten; daarna 5–30 minuten verwerking bij Apple.
5. **Testen:** App Store Connect → OKKIE. → TestFlight → *Interne tests* → groep maken → jezelf toevoegen. Op de iPhone
   de app **TestFlight** installeren en de uitnodiging openen.

Het script maakt per run een tijdelijk Apple Distribution-certificaat en App Store-profiel en trekt die na de upload
weer in (een account mag maar enkele distributiecertificaten hebben). Builds in TestFlight blijven werken.

### Testlijst op je iPhone (TestFlight)

1. Installeren, openen: startscherm OKKIE., daarna welkomstscherm met **Trainingen ophalen** bovenaan.
2. Overzetten: in Safari/beginscherm-OKKIE. *Overzetcode maken* → in de app plakken. Aantallen per speler vergelijken.
   Nog een keer: niets dubbel. Ook een keer met het back-upbestand.
3. Training van 30 pijlen, met het typvak (toetsenbord) en met de knoppen; trillen voelbaar?
4. Spraak aan (Meer): hoor je de stem? (Ook met de stille-modusschakelaar aan en uit.)
5. Meer → *Back-up bewaren in Bestanden* → iCloud Drive. Daarna *Back-up terugzetten* met dat bestand.
6. Scorekaart delen via WhatsApp en "Bewaar afbeelding"; OKKIE. aanraden.
7. Thema licht/donker: statusbalk leesbaar? Niets onder de Dynamic Island of thuisbalk?
8. Vliegtuigmodus: alles werkt behalve Darters/feedback.
9. App helemaal afsluiten en opnieuw openen: alles nog daar. Lopende training gaat verder.
10. Na de Worker-deploy: Darters bekijken, delen aan/uit, een darter verbergen en melden.

## App Store (pas na expliciet akkoord van de eigenaar)

Klaar in `appstore/`: teksten, trefwoorden, leeftijdsvragen, reviewnotities, privacylabels, screenshots.
Indienen voor review en publiceren doet de eigenaar zelf in App Store Connect; de workflow kan dat bewust niet.

### Minimale functionaliteit en andere reviewpunten

| Richtlijn | Hoe OKKIE. eraan voldoet |
|---|---|
| 4.2 Minimale functionaliteit | Volledige offline app met lokale opslag, statistieken, trefferkaart, 501-uitgooi-advies, spraak, Haptics, deelmenu en bestanden. Geen geladen website. |
| 2.1 Volledigheid | Geen testteksten, geen "binnenkort"-functies; Mijn vrienden staat uit en is niet zichtbaar. |
| 1.2 Gebruikersinhoud | Darters: alleen bijnamen (letters/cijfers, 2–24 tekens), *verbergen op dit toestel*, *meld dit profiel*, contact info@denckh.nl. Beheerder verwijdert gemelde profielen (D1, zie cloud/INFRASTRUCTUUR.md). |
| 5.1.1 Accounts | Geen verplicht account. Het Darters-profiel is vrijwillig en in de app te verwijderen (delen uit of speler verwijderen wist het online). |
| 5.1.1/5.1.2 Privacy | Privacyverklaring bijgewerkt (2a), PrivacyInfo.xcprivacy, geen tracking, geen ATT nodig. |
| 3.1 Betalingen | Geen aankopen, abonnementen of donaties (besluit eigenaar). |
| Kinderen | Niet in de Kids-categorie. Delen onder 16 staat dicht. |
| Exportnaleving | `ITSAppUsesNonExemptEncryption = false`. |

## Nog open / bekende beperkingen

- **Worker-deploy** (origin `capacitor://localhost`) wacht op akkoord.
- **Privacyverklaring** op okkiedarts.nl (paragraaf 2a, melden) is bijgewerkt in de bron; publiceren van de website
  wacht op akkoord (`node tools/build-public-site.mjs` → okkiedarts-site).
- Op een echte iPhone nog niet getest (geen toestel beschikbaar in deze omgeving): zie de testlijst.
- Geen iPad-versie (bewust; iPhone-app draait op iPad in iPhone-formaat).
- Webversie 1.8.0 (boot.js, Darters melden/verbergen) is nog niet gepubliceerd op app.okkiedarts.nl.
