# Overdracht OKKIE. — iOS-testfase 1.8.0

Stand: 1 november 2026 · gemerged in `main` (PR #9) · TestFlight build 20 intern, handmatig getest · zie ook IOS-APP.md (*Automatische UI-tests*).

## Wat er is gedaan
- **XCUITests** van de echte iPhone-app (target `OKKIEUITests`, gedeeld scheme `App`): tien scenario's — eerste
  installatie, onboarding, training invoeren en afronden, gemiddelden/statistieken/badges, instellingen bewaren,
  lopende training hervatten, annuleren zonder opslaan, offline trainen, gegevens na een update, uitleg/Darters openen.
- **Testmodus alleen in Debug** (`-OKKIEUITest`): schone opslag in de simulator, vaste verzonnen testdata
  (`tools/ios/uitest-fixture.mjs` → `ios/App/OKKIEUITests/Fixture.swift`), geen netwerk buiten de app (nooit de
  productie-API), JavaScript-fouten laten de test falen.
- **CI** (`.github/workflows/ios.yml`): UI-tests na de rooktest; `tools/ios/check-tests.sh` faalt bij gefaalde of
  overgeslagen tests, minder dan `UITEST_MIN` (10) en ontbrekende scenario's (`UITEST_REQUIRED`);
  `tools/ios/check-release.sh` bouwt Release en controleert dat de testmodus er niet in zit (tegenproef op Debug).
  Artefact *ios-simulator-rooktest*: `uitests.xcresult` (schermafbeelding per test), logs, rooktest.
- **App-fout gevonden en opgelost:** uitleg en Darters openden in de iPhone-app als wit scherm (Capacitor-router).
  `OKKIERouter` in `SceneDelegate.swift`. Niet in TestFlight-build 11; zit in de volgende build.

## Testresultaten (werkelijk gedraaid)
| Suite | Waar | Geslaagd | Mislukt | Overgeslagen |
|---|---|---|---|---|
| XCUITests (10 scenario's, verplichte namen 10/10) | CI run 41293721810, `macos-26`, commit `8de97a3` | 10 | 0 | 0 |
| Rooktest simulator (4 scenario's) | idem | ✔ **alleen na herpoging** (zie hieronder) | — | — |
| Release zonder testmodus (`check-release.sh`) | idem | ✔ Release: 0 markeringen · tegenproef Debug-dylib: 4 | — | — |
| Unit-tests app (`npm test`) | lokaal Windows, Node 24 | 156 | 0 | 0 |
| Cloud/Worker-tests | lokaal | 66 | 0 | 0 |
| Browsertests (Playwright, 3 profielen) | lokaal + CI op PR #9 | 255 | 0 | 51 (bewust per profiel via `test.skip`) |
| **Handmatig op echte iPhone** (Martijn) | TestFlight intern, build 20 (1.8.0), 1 november 2026 | ✔ "de app werkt goed" | — | geen details over specifieke schermen bekend |

Eerdere runs (41286432077, 41287820322, 41290961555, 41292351632) faalden op testfouten die zijn hersteld
(selectors, verwachte teksten) en op de echte app-fout (wit scherm uitleg/Darters).

## TestFlight build 20 (1 november 2026)
Gebouwd en geüpload vanaf `main` `183a360` (run 41299410715; simulatortests en UI-tests in dezelfde run groen,
rooktest zonder herpoging). Door Apple verwerkt (VALID), interne test (IN_BETA_TESTING) voor groep *OKKIE intern*;
geen externe testers, geen App Store-review. Exportnaleving zoals build 11 (`ITSAppUsesNonExemptEncryption = false`).
Martijn heeft build 20 op zijn iPhone geïnstalleerd en meldt: **de app werkt goed**. Welke schermen zijn bekeken en
of het een update over build 11 was, is niet bekend.

## Open punten
- **Rooktest-herpoging** (hieronder): instabiliteit niet opgelost, alleen gemaskeerd.
- **Echte app-update niet aantoonbaar getest:** niet automatisch (XCUITest) en ook niet bevestigd bij de handmatige
  test van build 20.
- **Webversie 1.8.0** wacht op akkoord van Martijn (app.okkiedarts.nl blijft 1.7.5).

## Bekende instabiliteit (niet opgelost)
- **Rooktest, eerste start na het opstarten van de simulator:** in run 41287820322 (poging 1) startte de app niet op
  de voorgrond en laadde daarna de webview niet; dezelfde commit slaagde bij een herhaling. `tools/ios/smoke.sh`
  probeert een hangende start nu één keer opnieuw en geeft dan een `::warning::`. De oorzaak is onbekend (vermoedelijk
  een trage simulator); de herpoging maskeert die. **In de laatste groene run (41293721810) slaagde de rooktest alleen dankzij deze herpoging**
(`::warning::0-nieuw: webview niet geladen bij de eerste start, nieuwe poging`). In run 41290961555 en 41292351632
was geen herpoging nodig. Vervolg: oorzaak onderzoeken (bijv. simulator vooraf opwarmen of `bootstatus` + wachten op
SpringBoard) en de herpoging daarna weer verwijderen.

## Niet automatisch gedekt
- Een echte update van build 11 naar een nieuwere build (XCUITest kan geen oudere build installeren); getest is
  dezelfde container met eerdere gegevens en een gewiste webviewopslag met herstel uit de duurzame kopie.
- Trillen, geluid, spraak, delen, back-up via Bestanden, Darters online (bewust geen productie-API), echte toestellen.
  Korte handmatige lijst: IOS-APP.md, *Met de hand op de iPhone*.

## Niet gedaan (bewust)
Geen webrelease 1.8.0 (app.okkiedarts.nl blijft 1.7.5), geen externe TestFlight-test of App Store-review (wel build 20
intern, op verzoek van Martijn), niets aan productie-API,
stagingworker of PR #7, geen betaalde diensten.

## Bouwstenen
Gebruikt: patroon `scripts/check-tests.sh` (modus xcode) uit tijd-gezinsapp, overgenomen en uitgebreid in
`tools/ios/check-tests.sh` (zelfde eigenaar; geen bibliotheekkaart). Gewijzigd: geen. Toegevoegd: geen kaart.
Kandidaat voor de bibliotheek (eigen `bibliotheek/*`-PR, nog niet gedaan): "XCUITest voor Capacitor-apps" —
Debug-only testmodus met netwerkblokkade en JS-foutmelder, controle op aantal + verplichte scenario's, Release-check
met tegenproef, en de Capacitor-router voor map-pagina's.
