// Waarborgen voor de iPhone-app (IOS-APP.md). Draait zonder Mac: alleen bestanden en de webbuild.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = f => readFileSync(join(root, f), 'utf8');
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
  assert.equal((pbx.match(/TARGETED_DEVICE_FAMILY = 1;/g) || []).length, 2);
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
  assert.match(wf, /<key>testFlightInternalTestingOnly<\/key><true\/>/, 'build kan niet naar de App Store of externe testers');
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
