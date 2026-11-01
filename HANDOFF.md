# Overdracht OKKIE. — iOS-testfase 1.8.0

Stand: 1 november 2026 · branch `claude/ios-uitests` → PR naar `main` · zie ook IOS-APP.md (*Automatische UI-tests*).

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
RESULTATEN

## Bekende instabiliteit (niet opgelost)
- **Rooktest, eerste start na het opstarten van de simulator:** in run 41287820322 (poging 1) startte de app niet op
  de voorgrond en laadde daarna de webview niet; dezelfde commit slaagde bij een herhaling. `tools/ios/smoke.sh`
  probeert een hangende start nu één keer opnieuw en geeft dan een `::warning::`. De oorzaak is onbekend (vermoedelijk
  een trage simulator); de herpoging maskeert die. RETRYSTATUS

## Niet automatisch gedekt
- Een echte update van build 11 naar een nieuwere build (XCUITest kan geen oudere build installeren); getest is
  dezelfde container met eerdere gegevens en een gewiste webviewopslag met herstel uit de duurzame kopie.
- Trillen, geluid, spraak, delen, back-up via Bestanden, Darters online (bewust geen productie-API), echte toestellen.
  Korte handmatige lijst: IOS-APP.md, *Met de hand op de iPhone*.

## Niet gedaan (bewust)
Geen webrelease 1.8.0 (app.okkiedarts.nl blijft 1.7.5), geen TestFlight-upload, niets aan productie-API,
stagingworker of PR #7, geen betaalde diensten.

## Bouwstenen
Gebruikt: patroon `scripts/check-tests.sh` (modus xcode) uit tijd-gezinsapp, overgenomen en uitgebreid in
`tools/ios/check-tests.sh` (zelfde eigenaar; geen bibliotheekkaart). Gewijzigd: geen. Toegevoegd: geen kaart.
Kandidaat voor de bibliotheek (eigen `bibliotheek/*`-PR, nog niet gedaan): "XCUITest voor Capacitor-apps" —
Debug-only testmodus met netwerkblokkade en JS-foutmelder, controle op aantal + verplichte scenario's, Release-check
met tegenproef, en de Capacitor-router voor map-pagina's.
