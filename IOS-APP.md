# OKKIE. als iPhone-app

Stand: 31 oktober 2026, versie 1.8.0, branch `claude/ios-app`. De bestaande webapp (dezelfde code als
app.okkiedarts.nl) is met **Capacitor 8** verpakt als echte iOS-app. De PWA en de website blijven los daarvan werken.

| | |
|---|---|
| Appnaam (beginscherm) | **OKKIE.** |
| Bundle-ID | `nl.denckh.okkie` |
| Team-ID | `GUAS9KT7W3` (individuele ontwikkelaar) |
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
| Offline | Alle bestanden in de app; geen serviceworker in de app | simulator ✔ (laadt `capacitor://localhost`, geen netwerk nodig) |
| Opslag | localStorage + duurzame kopie | simulator ✔ (ook na wissen) |
| Delen (OKKIE. aanraden, scorekaart, uitdagen) | `navigator.share` → native deelmenu | nagebootst ✔, **op iPhone testen** |
| Back-up exporteren | Deelmenu → Bewaar in Bestanden | nagebootst ✔, **op iPhone testen** |
| Back-up/overzetcode importeren | Bestandskiezer (`<input type=file>`), plakken | **op iPhone testen** |
| Spraak | `speechSynthesis` van de webview (WKWebView) | **op iPhone testen** (stille modus!) |
| Trillen | Haptics (navigator.vibrate bestaat niet op iOS) | nagebootst ✔ |
| Statusbalk | Volgt het thema (donker/licht) | simulator ✔ (lichte tekst op donker), thema wisselen nagebootst ✔ |
| Veilige randen | `viewport-fit=cover` + `env(safe-area-inset-*)` (al in de CSS) | simulator ✔ (Dynamic Island en thuisbalk vrij) |
| Toetsenbord | Standaard webview (geen Keyboard-plugin). Gevonden in de simulator: WKWebView opent bij `autofocus` meteen het toetsenbord; in de app staat autofocus op het welkomstscherm daarom uit | simulator ✔ welkomstscherm; **typvak bij trainen op iPhone testen** |
| Navigatie | Eigen terugknoppen; externe links openen in Safari | **op iPhone testen** |
| Camera/foto's | Alleen bij feedbackfoto en "Bewaar afbeelding" (teksten in Info.plist) | **op iPhone testen** |

## Wat is gecompileerd en getest (31 oktober 2026)

| Wat | Waar | Uitslag |
|---|---|---|
| iOS-app compileren (Debug, simulator) | GitHub Actions `macos-26`, Xcode 26.6, iOS 26.5 SDK | ✔ BUILD SUCCEEDED, geen waarschuwingen in eigen code |
| Rooktest in de iOS-simulator (iPhone, `tools/ios/smoke.sh`) | idem | ✔ 0: nieuwe installatie zonder fouten · 1: terugzetten uit kopie · 2: app schrijft kopie · 3: herstel na wissen webviewopslag |
| Unit-tests app (`npm test`) | Linux | ✔ 148/148 |
| Worker-tests (`cloud`) | Linux | ✔ 61/61 |
| Browsertests (`npm run test:e2e`, iPhone-/Android-/desktopformaat, incl. nagebootste app) | Linux, Chromium | ✔ 255/255 |
| Archief + ondertekenen + TestFlight-upload | workflow klaar | ✖ **nog niet gedraaid**: wacht op API-sleutel (secrets) en de app in App Store Connect |
| Echte iPhone | — | ✖ niet beschikbaar in deze omgeving: testlijst hieronder |

Schermafbeeldingen en logs van elke simulatorrun: Actions → OKKIE iPhone-app → run → artefact *ios-simulator-rooktest*.

## Automatische UI-tests (XCUITest, sinds 1.8.0)

Bij elke iOS-build (push naar `main`, `claude/ios-**`, `feature/**`, `release/**`, en vóór elke TestFlight-upload)
draaien in `.github/workflows/ios.yml` na de rooktest tien XCUITests van de echte app in de iPhone-simulator
(`ios/App/OKKIEUITests/OKKIEUITests.swift`):

| # | Scenario | Hoe |
|---|---|---|
| 1 | Eerste installatie | schone start, welkomstscherm, geen crash |
| 2 | Onboarding | naam invullen → startscherm met de vijf tabbladen |
| 3 | Training starten, scores invoeren, afronden | 180 + 60 → 120,00; na herstart in de geschiedenis |
| 4 | Gemiddelden, statistieken, badges | vaste testdata: 66,00 · beste 72,00 · slechtste 60,00 · badges 10/39 |
| 5 | Instellingen wijzigen en bewaren | schakelaar Geluidjes, na opnieuw openen nog gewijzigd; subscherm en terug |
| 6 | Lopende training hervatten | app afsluiten midden in een training → *Verder* → zelfde beurt |
| 7 | Training annuleren zonder opslaan | *Weggooien* → statistieken ongewijzigd |
| 8 | Offline trainen | zonder internet trainen en bewaren, telt mee |
| 9 | Gegevens na een update | zie beperking hieronder |
| 10 | Uitleg en Darters openen | geen wit scherm; Darters offline met nette melding |

**Testmodus (alleen Debug).** De tests starten de app met `-OKKIEUITest` (`SceneDelegate.swift`, `UITestMode`, binnen
`#if DEBUG`): opslag van de app in de simulator gewist, vaste verzonnen testdata (`tools/ios/uitest-fixture.mjs` →
`Fixture.swift`, speler "Testspeler"), geen enkel netwerkverzoek buiten de app (fetch/XHR/beacon/WebSocket mislukken
zoals zonder internet; de productie-API wordt nooit benaderd) en elke JavaScript-fout laat de test falen.
Bewaakt door: `tools/ios/check-release.sh` (Release-build zonder testmodus, tegenproef op Debug, in CI) en unittests
in `tests/unit/ios.test.js`.

**De build faalt** bij een gefaalde of overgeslagen test, bij minder dan `UITEST_MIN` tests en als een scenario uit
`UITEST_REQUIRED` ontbreekt of niet slaagt (`tools/ios/check-tests.sh`). Resultaten (`uitests.xcresult` met een
schermafbeelding per test), logs en de rooktest staan altijd als artefact *ios-simulator-rooktest* bij de run.

**Gevonden en opgelost met deze tests:** in de app openden de uitleg en Darters als wit scherm (Capacitor gaf voor
`/uitleg/` de hoofd-`index.html`). `OKKIERouter` laadt nu de `index.html` van de map.

**Beperkingen (eerlijk):**
- *Update*: XCUITest kan geen oudere build installeren. Getest is wat bij een update gebeurt: dezelfde container met
  de gegevens van eerder, en een gewiste webviewopslag waarna alles uit de duurzame kopie terugkomt. Een echte
  update van build 11 naar een nieuwere build is niet automatisch getest.
- Niet automatisch: trillen, geluid en spraak, delen (WhatsApp, Bestanden), echte netwerkuitval op een toestel,
  Darters online (bewust: geen productie-API in tests), Dynamic Island en thuisbalk op echte toestellen.
- **Bekende instabiliteit rooktest:** de eerste start na het opstarten van de simulator bleef in CI één keer hangen
  (run 41287820322, poging 1: app niet op de voorgrond, daarna webview niet geladen). `smoke.sh` probeert een
  hangende start nu één keer opnieuw en meldt dat als waarschuwing. Dat maskeert de oorzaak (onbekend, vermoedelijk
  trage simulator) en is dus **niet opgelost**; een tweede mislukte poging laat de build wel falen.

### Met de hand op de iPhone (kort)

1. Installeren via TestFlight en openen.
2. Overzetten vanuit Safari/beginscherm (overzetcode): aantallen kloppen, niets dubbel.
3. Trillen, geluid en spraak tijdens een training.
4. Back-up naar Bestanden en terugzetten; scorekaart delen.
5. Statusbalk/Dynamic Island in licht en donker thema.
6. Na een volgende TestFlight-build: bijwerken over build 11 heen, alles nog daar.

## Server (Darters, Hulp & feedback, dagteller)

De webview stuurt `Origin: capacitor://localhost`. Die staat in `cloud/wrangler.toml` (test: `cloud/tests/ios-origin.test.js`).
**Nog te doen, na akkoord eigenaar:** Worker opnieuw deployen (`cd cloud && npx wrangler deploy --env production`).
Tot dan werkt de app volledig, alleen Darters/feedback/dagteller geven in de app "niet bereikbaar".

## Bouwen en TestFlight

### Elke push (automatisch)

`.github/workflows/ios.yml` → job **Compileren en rooktest**: `npm ci`, `build-ios-web`, `cap sync ios`, `xcodebuild`
voor de simulator, `tools/ios/smoke.sh`, de XCUITests (zie *Automatische UI-tests*) en de Release-controle op de
testmodus. Schermafbeeldingen, logs en `uitests.xcresult` staan als artefact bij de run.

### TestFlight

**Hoe de route is beveiligd**
- Het iOS-project en `ios.yml` staan op `main` (samengevoegd 31-10-2026). Een push naar `main` bouwt alleen voor de
  simulator (rooktest); TestFlight start nooit vanzelf. GitHub Pages vanaf `main` is het oude adres, dat doorstuurt
  naar app.okkiedarts.nl; app.okkiedarts.nl zelf verandert alleen via de aparte publicatieronde.
- Bij *Run workflow* kies je de branch; GitHub gebruikt dan de workflow én de code van die branch. TestFlight draait
  alleen vanaf `claude/ios-app`, `release/…` of `main`, en alleen met het vinkje. De secrets in environment
  `testflight` zijn alleen beschikbaar voor de branches die daar zijn toegestaan (Settings → Environments). Vanaf een branch zonder
  iOS-project stopt de run meteen met een duidelijke melding. Een push breekt een lopende TestFlight-run niet af.
- App Store Connect-gegevens komen alleen uit de secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, alleen in de
  TestFlight-job, en worden nooit afgedrukt (vooraf gecontroleerd op vorm, zonder waarden te tonen).
- Per run een tijdelijk Apple Distribution-certificaat en App Store-profiel; na afloop wordt **alleen dat** certificaat
  ingetrokken (ID én serienummer moeten kloppen) en alleen een profiel met de naam `OKKIE App Store CI …` verwijderd.
  Je eigen certificaten en profielen worden nooit aangeraakt. Builds in TestFlight blijven werken.
- De build wordt gemaakt als *alleen interne TestFlight-test* (`testFlightInternalTestingOnly`): hij kan niet naar
  externe testers of de App Store. Voor de echte App Store-versie komt later een aparte, bewuste stap.
- Altijd de nieuwste **niet-bèta** Xcode 26 (Apple weigert bèta-builds).

**Eenmalig door de eigenaar** (zie de laatste paragraaf van dit document voor de exacte stappen):
1. App Store Connect: API-sleutel (rol Admin), app aanmaken met bundle-ID `nl.denckh.okkie`.
2. GitHub: drie secrets, bij voorkeur in de environment `testflight` (Settings → Environments → testflight →
   *Deployment branches*: `claude/ios-app` en `release/*`).
3. Actions → **OKKIE iPhone-app** → *Run workflow* → *Use workflow from*: **claude/ios-app** → vinkje **TestFlight** → Run.
4. App Store Connect → TestFlight → interne testgroep → jezelf toevoegen; op de iPhone de app TestFlight.

### Uitgebreide testlijst op je iPhone (TestFlight, optioneel)

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
- Op een echte iPhone nog niet getest (geen toestel beschikbaar in deze omgeving): zie *Met de hand op de iPhone*.
- Rooktest: bekende instabiliteit bij de eerste start (zie *Automatische UI-tests*, beperkingen).
- Geen iPad-versie (bewust; iPhone-app draait op iPad in iPhone-formaat).
- Webversie 1.8.0 (boot.js, Darters melden/verbergen) is nog niet gepubliceerd op app.okkiedarts.nl.

## Stand TestFlight (1 november 2026)

- API-sleutel (rol App Manager), app *OKKIE. Darttrainer* (`nl.denckh.okkie`, team `GUAS9KT7W3`) en de secrets in
  environment `testflight` zijn ingericht. Toegestane branches: `claude/ios-app`, `main`, `release/*`.
- **Build 11 (1.8.0)** staat in TestFlight, alleen interne test, groep *OKKIE intern* (toegang tot alle builds).
  Tester: `info@deegh.nl` (status: uitgenodigd).
- Build 11 is gemaakt vóór de router-reparatie (uitleg/Darters wit scherm); die zit pas in een volgende build.

**Nog te doen door de eigenaar:** de TestFlight-uitnodiging op de iPhone openen (mail aan info@deegh.nl), de app
TestFlight installeren en daarin OKKIE. installeren. Een nieuwe build (met de router-reparatie) maken kan via
Actions → OKKIE iPhone-app → Run workflow → `main` → vinkje TestFlight; dat is een upload en gebeurt alleen op verzoek.
