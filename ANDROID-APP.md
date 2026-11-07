# OKKIE. als Android-app (VOORBEREID, niet gepubliceerd)

Zelfde opzet als de iPhone-app (`IOS-APP.md`): Capacitor 8 met **exact dezelfde webapp** (`tools/build-ios-web.mjs`
→ `dist-ios/`, ook de webDir voor Android), lokaal gebundeld, dus trainen werkt zonder internet. App-ID
`nl.denckh.okkie`, versienaam = `package.json` (nu 1.11.0).

## Wat er klaarstaat
| Onderdeel | Waar |
|---|---|
| Android-project (Capacitor 8.5.3, minSdk 24, targetSdk 36) | `android/` |
| Versie en ondertekenen (uploadsleutel alleen uit secrets) | `android/app/build.gradle` |
| Alleen internetrecht; Android-back-up neemt de trainingen mee (webviewopslag + duurzame kopie) | `AndroidManifest.xml`, `res/xml/backup_rules.xml`, `res/xml/data_extraction_rules.xml` |
| Icoon (klassiek, rond, adaptief) en startscherm | `tools/make-android-assets.mjs` → `android/app/src/main/res/` |
| Terugknop: venster dicht → startscherm → pagina terug → app naar achtergrond | `js/native.js` (`onBack`, `handleBack`), `js/app.js` |
| Rand-tot-rand (Android 15+): SystemBars `insetsHandling: css` (de app gebruikt al `env(safe-area-inset-*)`) | `capacitor.config.json` |
| Teksten zonder iPhone/Safari/iCloud in de Android-app | `js/app.js` (`ANDROID`) |
| API: origin van de Android-webview `https://localhost` toegestaan | `cloud/wrangler.toml` (**pas actief na de eerstvolgende Worker-deploy**) |
| Build in GitHub Actions: Gradle-tests, debug-APK, release-AAB, controle versie/rechten, rooktest in de emulator | `.github/workflows/android.yml`, `tools/android/smoke.sh` |
| Play Store-teksten, gegevensveiligheid, contentclassificatie, doelgroepadvies | `appstore/PLAYSTORE-TEKSTEN.md` |
| Tests | `tests/unit/android.test.js`, `cloud/tests/android-origin.test.js` |

De workflow publiceert **nooit** naar Google Play (getest in `tests/unit/android.test.js`).

## Proberen op je eigen Android-telefoon (gratis, zonder Play)
1. GitHub → Actions → *OKKIE Android-app* → laatste groene run → artefact `okkie-android-…` → `app-debug.apk`.
2. Op de telefoon: APK openen, "installeren uit onbekende bron" voor die ene keer toestaan.
3. Let op: tot de Worker-deploy met `https://localhost` werken Darters, Club en Hulp & feedback in de Android-app nog
   niet (CORS); trainen, statistieken en back-ups wel.

## Naar Google Play (handelingen Martijn, met akkoord)
1. **Ontwikkelaarsaccount** (eenmalig 25 dollar; betaalde dienst, dus jouw besluit). Organisatie (Denckh., KvK +
   D-U-N-S-nummer) of persoonlijk. **Let op bij een persoonlijk account:** nieuwe persoonlijke accounts moeten eerst
   een **gesloten test met minimaal 12 testers gedurende 14 dagen** draaien voordat productie mag; bij een
   organisatie-account geldt dat niet. Controleer de actuele eisen in de Play Console-hulp bij het aanmaken.
2. **Uploadsleutel** maken (eenmalig, bewaar hem en de wachtwoorden ook buiten GitHub):
   `keytool -genkeypair -v -keystore okkie-upload.jks -alias okkie-upload -keyalg RSA -keysize 4096 -validity 10000`
   en als GitHub-secrets zetten: `OKKIE_UPLOAD_KEYSTORE_B64` (`base64 -w0 okkie-upload.jks`),
   `OKKIE_UPLOAD_STORE_PASSWORD`, `OKKIE_UPLOAD_KEY_ALIAS` (`okkie-upload`), `OKKIE_UPLOAD_KEY_PASSWORD`.
   Gebruik **Play App Signing** (Google bewaart de app-sleutel; kwijtraken van de uploadsleutel is dan herstelbaar).
3. **Worker** uitrollen met de Android-origin (`npm run deploy:production` in `cloud/`); controleer met
   `node --test cloud/tests/android-origin.test.js` en een live verzoek met `Origin: https://localhost`.
4. App aanmaken in de Play Console (naam, standaardtaal Nederlands, gratis, app — geen game), Store-vermelding en
   formulieren invullen uit `appstore/PLAYSTORE-TEKSTEN.md`, ondertekende AAB uit de workflow uploaden naar
   **Intern testen**, testen, dan pas (gesloten test →) productie.
5. Website: Google Play-badge pas tonen als de app openbaar staat (zelfde aanpak als `appStoreApproved`).

## Bekende punten
- Afdrukken van de clubposter: in de Android-app opent de poster op app.okkiedarts.nl in Chrome (zelfde als iOS met
  Safari), want de webview kan niet afdrukken.
- QR-codes openen de website/webapp in Chrome, niet de app (App Links nog niet ingericht; zie `cloud/CLUB.md`, Nog niet).
  De uitnodigingspagina en de clubpagina waarschuwen al dat browser en app geen spelers delen.
- De emulator-rooktest controleert opstarten en de terugknop; een update-test (oude → nieuwe versie met gegevens) zoals
  bij iOS volgt zodra er een eerste openbare Android-versie is.
