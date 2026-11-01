// Waarborgen voor de iPhone-app (IOS-APP.md). Draait zonder Mac: alleen bestanden en de webbuild.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = f => readFileSync(join(root, f), 'utf8');
const lf = s => s.replace(/\r\n/g, '\n'); // Windows-checkout (autocrlf) heeft CRLF
const pkg = JSON.parse(read('package.json'));
const cap = JSON.parse(read('capacitor.config.json'));
const plist = read('ios/App/App/Info.plist');
const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
const key = (k, xml = plist) => (xml.match(new RegExp(`<key>${k}</key>\\s*<([a-z]+)\\s*/?>(?:([^<]*)</\\1>)?`)) || []).slice(1);

test('app-ID, naam en herkomst liggen vast (andere herkomst = lege opslag voor iedereen)', () => {
  assert.equal(cap.appId, 'nl.denckh.okkie');
  assert.equal(cap.appName, 'OKKIE.');
  assert.equal(cap.webDir, 'dist-ios');
  // localStorage hoort bij capacitor://localhost. NOOIT wijzigen: dan begint elke bestaande app leeg.
  assert.equal(cap.server.hostname, 'localhost');
  assert.equal(cap.server.iosScheme, 'capacitor');
  assert.equal(cap.server.url, undefined, 'geen live-herlaadadres in de app');
  assert.equal(cap.plugins.SplashScreen.launchAutoHide, false, 'js/boot.js verbergt het startscherm zelf');
});

test('Info.plist: Nederlands, alleen staand, versleuteling vrijgesteld, uitleg bij camera en foto bewaren', () => {
  assert.deepEqual(key('CFBundleDevelopmentRegion'), ['string', 'nl']);
  assert.deepEqual(key('CFBundleDisplayName'), ['string', 'OKKIE.']);
  assert.deepEqual(key('ITSAppUsesNonExemptEncryption'), ['false', undefined]);
  assert.match(plist, /<key>UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
  assert.match(plist, /<key>UIRequiredDeviceCapabilities<\/key>\s*<array>\s*<string>arm64<\/string>/);
  assert.ok(key('NSCameraUsageDescription')[1]?.length > 20, 'zonder deze tekst crasht "Foto maken" bij Hulp & feedback');
  assert.ok(key('NSPhotoLibraryAddUsageDescription')[1]?.length > 20, 'zonder deze tekst crasht "Bewaar afbeelding" in het deelmenu');
});

test('Xcode-project: alleen iPhone, team en versie gelijk aan package.json, privacymanifest in de app', () => {
  assert.equal((pbx.match(/TARGETED_DEVICE_FAMILY = 1;/g) || []).length, 4, 'app en UI-tests, Debug en Release');
  assert.equal((pbx.match(/DEVELOPMENT_TEAM = GUAS9KT7W3;/g) || []).length, 2);
  assert.equal((pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = nl\.denckh\.okkie;/g) || []).length, 2);
  assert.equal((pbx.match(/MARKETING_VERSION = ([\d.]+);/g) || []).map(m => m.match(/[\d.]+/)[0]).filter(v => v !== pkg.version).length, 0, 'MARKETING_VERSION = package.json');
  assert.match(pbx, /PrivacyInfo\.xcprivacy in Resources/);
  const priv = read('ios/App/App/PrivacyInfo.xcprivacy');
  assert.deepEqual(key('NSPrivacyTracking', priv), ['false', undefined]);
  assert.match(priv, /NSPrivacyCollectedDataTypeProductInteraction/);
  assert.doesNotMatch(priv, /NSPrivacyCollectedDataTypeTracking<\/key>\s*<true/);
});

test('app-icoon: 1024 x 1024 zonder alfakanaal; startscherm aanwezig', () => {
  const png = readFileSync(join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 2, 'PNG-kleurtype 2 (RGB): App Store weigert iconen met alfakanaal');
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) assert.ok(existsSync(join(root, 'ios/App/App/Assets.xcassets/Splash.imageset', n)));
});

test('webbuild voor de app: dezelfde app als app.okkiedarts.nl, met opstarten via boot.js', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-ios-web.mjs')], { cwd: root, stdio: 'pipe' });
  const dist = join(root, 'dist-ios');
  for (const f of ['index.html', 'js/boot.js', 'js/native.js', 'js/app.js', 'community/index.html', 'uitleg/index.html', 'icons/icon-512.png'])
    assert.equal(readFileSync(join(dist, f), 'utf8').length > 0, true, f);
  for (const f of ['index.html', 'js/app.js', 'js/native.js', 'css/app.css']) assert.equal(readFileSync(join(dist, f), 'utf8'), read(f), f);
  assert.match(read('index.html'), /<script type="module" src="js\/boot\.js"><\/script>/);
  const files = readdirSync(dist, { recursive: true }).map(String);
  assert.ok(!files.some(f => /^(cloud|tests|tools|ios|node_modules)\b/.test(f)), 'geen servercode, tests of tools in de app');
});

test('workflow: handmatig te starten, TestFlight alleen vanaf de iOS-branch, nooit naar de App Store', () => {
  const wf = read('.github/workflows/ios.yml').replace(/\r\n/g, '\n'); // Windows-checkout (autocrlf) heeft CRLF
  assert.match(wf, /^  workflow_dispatch:/m, 'handmatig te starten (bestand moet ook op main staan)');
  assert.match(wf, /github\.event_name == 'workflow_dispatch' && inputs\.testflight &&/);
  assert.match(wf, /github\.ref == 'refs\/heads\/claude\/ios-app'/);
  assert.match(wf.match(/^  push:\n(?:    #.*\n)*    branches: \[(.*)\]/m)?.[1] || '', /\bmain\b/, 'push op main bouwt voor de simulator (iOS-project staat op main)');
  assert.match(wf, /if: >-\n\s+github\.event_name == 'workflow_dispatch' && inputs\.testflight/, 'TestFlight nooit bij een push');
  assert.match(wf, /Op branch '\$GITHUB_REF_NAME' staat geen iOS-project/);
  assert.match(wf, /cancel-in-progress: \$\{\{ github\.event_name == 'push' \}\}/, 'een push breekt een TestFlight-run niet af');
  // Standaard alleen interne test; alleen met het aparte vinkje appstore mag de build aan een App Store-versie.
  assert.match(wf, /<key>testFlightInternalTestingOnly<\/key><\$INTERNAL_ONLY\/>/);
  assert.match(wf, /INTERNAL_ONLY: \$\{\{ inputs\.appstore && 'false' \|\| 'true' \}\}/, 'zonder vinkje appstore: alleen intern');
  assert.match(wf, /appstore:\n\s+description: .*\n\s+type: boolean\n\s+default: false/, 'appstore staat standaard uit');
  // Screenshots tellen niet mee bij de gewone UI-tests en draaien alleen handmatig.
  assert.match(wf, /-skip-testing:OKKIEUITests\/AppStoreScreenshots/);
  assert.match(wf, /if: github\.event_name == 'workflow_dispatch' && inputs\.screenshots/);
  assert.doesNotMatch(wf, /submit|appStoreVersionSubmissions|reviewSubmissions|deliver\b|altool/i);
  assert.match(wf, /asc-signing\.mjs cleanup/, 'tijdelijk certificaat wordt altijd opgeruimd');
  assert.match(wf, /select-xcode\.sh/, 'nooit met een bèta-Xcode bouwen');
});

test('workflow: App Store Connect-gegevens alleen uit secrets, nooit afgedrukt', () => {
  const wf = read('.github/workflows/ios.yml');
  for (const k of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8']) assert.match(wf, new RegExp(`${k}: \\$\\{\\{ secrets\\.${k} \\}\\}`));
  assert.equal((wf.match(/secrets\./g) || []).length, 3, 'geen andere of dubbele secrets');
  assert.doesNotMatch(wf, /echo[^\n]*\$\{?ASC_|set -x|-----BEGIN/);
  assert.doesNotMatch(wf, /pull_request_target/);
  // Secrets alleen in de TestFlight-job (die alleen handmatig draait).
  assert.doesNotMatch(wf.split('\n  testflight:')[0], /secrets\./);
});

test('geen aankopen, abonnementen of advertenties in de app', () => {
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ');
  assert.doesNotMatch(deps, /purchase|billing|revenuecat|admob|ads\b|stripe/i);
  assert.doesNotMatch(pbx, /StoreKit|GoogleMobileAds/);
});

test('UI-tests (XCUITest): target, scheme, vaste testdata en minimum in de workflow', async () => {
  assert.match(pbx, /productType = "com\.apple\.product-type\.bundle\.ui-testing";/);
  assert.equal((pbx.match(/TEST_TARGET_NAME = App;/g) || []).length, 2);
  const scheme = read('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme');
  assert.match(scheme, /BlueprintName = "OKKIEUITests"/);
  assert.match(scheme, /<ArchiveAction\s+buildConfiguration = "Release"/, 'TestFlight-archief blijft Release');
  const swift = read('ios/App/OKKIEUITests/OKKIEUITests.swift');
  const tests = (swift.match(/^\s*func test\w+\(\)/gm) || []).length;
  const wf = lf(read('.github/workflows/ios.yml'));
  const min = Number((wf.match(/UITEST_MIN: (\d+)/) || [])[1]);
  assert.equal(min, tests, `UITEST_MIN (${min}) = aantal tests in OKKIEUITests.swift (${tests})`);
  assert.ok(tests >= 10);
  const names = [...swift.matchAll(/^\s*func (test\w+)\(\)/gm)].map(m => m[1]).sort();
  const req = (wf.match(/UITEST_REQUIRED: >-\n((?:\s{12}.*\n)+)/) || [])[1]?.split(',').map(s => s.trim()).filter(Boolean).sort();
  assert.deepEqual(req, names, 'UITEST_REQUIRED = alle tests in OKKIEUITests.swift');
  for (const s of ['Installatie', 'Onboarding', 'Scores', 'Badges', 'Instellingen', 'Hervatten', 'Annuleren', 'Offline', 'Update']) {
    assert.ok(names.some(n => n.includes(s)), `essentieel scenario ontbreekt: ${s}`);
  }
  assert.match(wf, /tools\/ios\/check-release\.sh "\$BIN"/, 'Release-build wordt op testmodus gecontroleerd');
  assert.match(wf, /tools\/ios\/check-tests\.sh uitests\.xcresult "\$UITEST_MIN"/);
  const { fixtureSwift } = await import(new URL('../../tools/ios/uitest-fixture.mjs', import.meta.url).href);
  assert.equal(lf(read('ios/App/OKKIEUITests/Fixture.swift')), fixtureSwift(), 'Fixture.swift opnieuw maken: node tools/ios/uitest-fixture.mjs');
});

test('UI-testmodus alleen in Debug: nooit in TestFlight of de App Store', () => {
  const scene = lf(read('ios/App/App/SceneDelegate.swift'));
  assert.match(scene, /rootViewController = OKKIEBridgeViewController\(\)/);
  const debugBlocks = [...scene.matchAll(/#if DEBUG\n([\s\S]*?)#endif/g)].map(m => m[1]).join('\n');
  const outside = scene.replace(/#if DEBUG\n[\s\S]*?#endif/g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(debugBlocks, /enum UITestMode/);
  assert.doesNotMatch(outside, /UITestMode|OKKIE_FIXTURE|-OKKIEUITest|addUserScript/, 'testcode buiten #if DEBUG');
  assert.match(debugBlocks, /isActive: Bool \{ args\.contains\("-OKKIEUITest"\) \}/, 'alleen met het startargument van de tests');
  assert.match(debugBlocks, /Promise\.reject\(blocked\(\)\)/, 'netwerk buiten de app geblokkeerd');
});

test('vaste UI-testdata: verzonnen speler, wordt teruggezet met de bekende uitkomst', async () => {
  const { fixtureMirror, FIXTURE_PLAYER } = await import(new URL('../../tools/ios/uitest-fixture.mjs', import.meta.url).href);
  const { restoreInto } = await import(new URL('../../js/native.js', import.meta.url).href);
  const { createStore } = await import(new URL('../../js/store.js', import.meta.url).href);
  const L = await import(new URL('../../js/logic.js', import.meta.url).href);
  const m = new Map();
  const storage = { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  assert.equal(restoreInto(storage, fixtureMirror()).restored, true);
  const d = createStore(storage).load().data;
  assert.deepEqual(d.players.map(p => p.name), [FIXTURE_PLAYER]);
  const t = d.trainings.map(x => L.trainingTotals(x));
  assert.deepEqual(t.map(x => [x.points, x.darts, x.avg]), [[600, 30, 60], [720, 30, 72]]);
  assert.equal(L.avg3(1320, 60), 66);
});

test('App Store-screenshots: demogegevens in de simulator gelijk aan de generator, aparte testklasse', async () => {
  const { screenshotFixtureSwift } = await import(new URL('../../tools/ios/appstore-fixture.mjs', import.meta.url));
  assert.equal(lf(read('ios/App/OKKIEUITests/ScreenshotFixture.swift')), screenshotFixtureSwift(), 'node tools/ios/appstore-fixture.mjs opnieuw draaien');
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  for (const f of ['AppStoreScreenshots.swift in Sources', 'ScreenshotFixture.swift in Sources']) assert.ok(pbx.includes(f), f);
  const swift = read('ios/App/OKKIEUITests/AppStoreScreenshots.swift');
  assert.match(swift, /"-OKKIEUITest"/, 'testmodus: geen netwerk buiten de app');
  for (const n of ['1-home', '2-training', '3-uitslag', '4-statistieken', '5-trefferkaart', '6-wedstrijd-501']) assert.ok(swift.includes(`shot("${n}")`), n);
  assert.doesNotMatch(read('ios/App/OKKIEUITests/OKKIEUITests.swift'), /AppStoreScreenshots/);
});

test('UI-testmodus wordt geladen waar Capacitor hem niet weggooit, en elke test bewijst dat hij actief is', () => {
  const scene = lf(readFileSync(new URL('../../ios/App/App/SceneDelegate.swift', import.meta.url), 'utf8'));
  // Capacitor vervangt na webViewConfiguration(for:) de userContentController; daar toegevoegde scripts gaan verloren.
  assert.match(scene, /override func webView\(with frame: CGRect, configuration: WKWebViewConfiguration\) -> WKWebView \{\n\s+#if DEBUG\n\s+UITestMode\.install\(into: configuration\)/);
  assert.doesNotMatch(scene, /func webViewConfiguration\(for[^}]*UITestMode\.install/s);
  assert.match(scene, /aria-label', 'okkie-uitest-actief'/);
  const tests = lf(readFileSync(new URL('../../ios/App/OKKIEUITests/OKKIEUITests.swift', import.meta.url), 'utf8'));
  assert.match(tests, /app\.launch\(\)\n\s+self\.app = app\n\s+assertTestModeActive\(app\)/);
  assert.match(lf(readFileSync(new URL('../../tools/ios/check-release.sh', import.meta.url), 'utf8')), /okkie-uitest-actief/);
});
