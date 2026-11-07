// Android-app (Capacitor, ANDROID-APP.md): zelfde app-ID en versie als iOS, alleen internetrecht, back-up van de
// trainingen, terugknop, origin voor de API, en een workflow die nooit naar Google Play publiceert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { handleBack, onBack } from '../../js/native.js';

const read = rel => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');

test('project: app-ID nl.denckh.okkie, versienaam uit package.json, versiecode per build, sleutel alleen uit secrets', () => {
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /applicationId "nl\.denckh\.okkie"/);
  assert.match(gradle, /versionName okkiePackage\.version/);
  assert.match(gradle, /JsonSlurper\(\)\.parse\(file\('\.\.\/\.\.\/package\.json'\)\)/);
  assert.match(gradle, /versionCode okkieVersionCode/);
  assert.match(gradle, /System\.getenv\('OKKIE_UPLOAD_KEYSTORE'\)/);
  assert.doesNotMatch(gradle, /storePassword ['"]/, 'geen wachtwoord in Git');
  for (const p of ['*.jks', '*.keystore']) assert.ok(read('android/.gitignore').includes(p), p);
  const cfg = JSON.parse(read('capacitor.config.json'));
  assert.equal(cfg.appId, 'nl.denckh.okkie');
  assert.equal(cfg.server.androidScheme, 'https');
  assert.equal(cfg.android.webContentsDebuggingEnabled, false);
  assert.equal(cfg.plugins.SystemBars.insetsHandling, 'css');
  assert.equal(JSON.parse(read('package.json')).dependencies['@capacitor/android'], JSON.parse(read('package.json')).dependencies['@capacitor/core']);
});

test('manifest: alleen internet (trillen voegt de Haptics-plugin toe), back-up van de trainingen (webviewopslag en duurzame kopie), geen cache', () => {
  const m = read('android/app/src/main/AndroidManifest.xml');
  const perms = [...m.matchAll(/uses-permission android:name="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(perms, ['android.permission.INTERNET']);
  assert.match(m, /android:fullBackupContent="@xml\/backup_rules"/);
  assert.match(m, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  for (const f of ['backup_rules.xml', 'data_extraction_rules.xml']) {
    const x = read('android/app/src/main/res/xml/' + f);
    assert.match(x, /path="app_webview\/"/);
    assert.match(x, /domain="file" path="\."/);
  }
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'])
    for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) assert.ok(existsSync(new URL(`../../android/app/src/main/res/mipmap-${d}/${f}`, import.meta.url)), d + '/' + f);
  assert.match(read('android/app/src/main/res/values/ic_launcher_background.xml'), /#07120d/i);
});

test('terugknop: eerst de pagina (venster dicht, naar start), dan een pagina terug, anders app naar de achtergrond', () => {
  const calls = [];
  const app = { minimizeApp: () => calls.push('minimize'), exitApp: () => calls.push('exit') };
  const history = { back: () => calls.push('back') };
  onBack(() => true);
  assert.equal(handleBack({ canGoBack: true }, { history, app }), 'handled');
  onBack(() => false);
  assert.equal(handleBack({ canGoBack: true }, { history, app }), 'back');
  assert.equal(handleBack({ canGoBack: false }, { history, app }), 'minimize');
  assert.equal(handleBack({ canGoBack: false }, { history, app: { exitApp: () => calls.push('exit') } }), 'exit');
  assert.deepEqual(calls, ['back', 'minimize', 'exit']);
  onBack(null);
  // In de app: venster sluiten, gerichte oefening blijft staan, anders naar het startscherm.
  const appJs = read('js/app.js');
  assert.match(appJs, /N\.onBack\(\(\) => \{\n  if \(!\$\('#modal'\)\.hidden\) \{ closeModal\(\); return true; \}/);
  assert.match(appJs, /if \(DRILL_VIEWS\.has\(ui\.view\)\) return true;/);
});

test('teksten in de Android-app noemen geen iPhone, Safari of iCloud', () => {
  const appJs = read('js/app.js');
  assert.match(appJs, /const ANDROID = N\.platform\(\) === 'android';/);
  assert.match(appJs, /ANDROID \? 'Je gegevens staan alleen op deze telefoon \(ook in de Android-back-up/);
  assert.match(appJs, /In \$\{ANDROID \? 'Chrome' : 'Safari'\}/);
});

test('workflow: bouwt, test in de emulator, publiceert nooit naar Google Play; API staat de Android-origin toe', () => {
  const wf = read('.github/workflows/android.yml');
  assert.match(wf, /assembleDebug bundleRelease/);
  assert.match(wf, /tools\/android\/smoke\.sh/);
  assert.doesNotMatch(wf, /upload-google-play|androidpublisher|fastlane supply|play-publisher/i);
  assert.match(wf, /test -z "\$PERMS"/, 'controle: alleen internet (en trillen via Haptics) in de gebouwde APK');
  assert.match(wf, /grep -v "android\.permission\.VIBRATE'"/);
  assert.doesNotMatch(wf, /grep -v "android\.permission\.(CAMERA|ACCESS_|READ_|WRITE_|POST_NOTIFICATIONS)/);
  const origins = [...read('cloud/wrangler.toml').matchAll(/^ALLOWED_ORIGINS = "([^"]+)"/gm)].map(m => m[1].split(','));
  for (const o of origins) assert.ok(o.includes('https://localhost'));
});
