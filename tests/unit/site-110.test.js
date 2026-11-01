// okkiedarts.nl voor 1.10.0: "Gratis. Geen reclame. Geen abonnement.", Club prominent, Over OKKIE., en twee schakelaars:
// het blok Gericht oefenen pas na de release van 1.10.0, de App Store-badge pas na goedkeuring van 1.8.0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Eigen uitvoermap: dist/ blijft voor de andere tests, die tegelijk draaien.
const out = mkdtempSync(join(tmpdir(), 'okkie-site-'));
const build = (env = {}) => execFileSync(process.execPath, ['tools/build-public-site.mjs'], { cwd: root, stdio: 'pipe', env: { ...process.env, OKKIE_SITE_PREVIEW: '', OKKIE_SITE_OUT: out, ...env } }).toString();
const dist = p => readFileSync(join(out, p), 'utf8');
process.on('exit', () => rmSync(out, { recursive: true, force: true }));

test('site-config: release110 en de App Store-badge staan uit tot de release en de goedkeuring', () => {
  const cfg = JSON.parse(readFileSync(join(root, 'ontdek/site-config.json'), 'utf8'));
  assert.equal(cfg.release110, false, 'pas aanzetten als 1.10.0 live staat');
  assert.equal(cfg.appStoreApproved, false, 'pas aanzetten na goedkeuring door Apple');
  assert.match(cfg.appStoreUrl, /^https:\/\/apps\.apple\.com\/nl\/app\/id6829301399$/);
});

test('website (productie-build): gratis-belofte bovenaan, Club direct onder de hero, Over OKKIE., geen voorbarige onderdelen', () => {
  try {
    assert.match(build(), /release110: false, App Store-badge: false/);
    const home = dist('index.html');
    assert.match(home, /data-testid="gratis"><span class="pulse"><\/span> Gratis\. Geen reclame\. Geen abonnement\.<\/div>/);
    assert.doesNotMatch(home, /id="gericht"|appstore-badge|Vandaag oefenen|<!--(IF|END):|\{\{APPSTORE_URL\}\}/);
    assert.match(home, /houd je reeks vast/, 'tekst van 1.9.0 blijft tot de release');
    assert.ok(home.indexOf('id="club"') < home.indexOf('id="kids"'), 'Club staat direct onder de hero');
    assert.match(home, /<nav[^>]*>\s*<a href="\/club\/">Club<\/a>/);
    const over = dist('over/index.html');
    assert.match(over, /<h1>/); assert.match(over, /mailto:info@denckh\.nl/); assert.match(over, /Denckh/);
    assert.match(over, /href="\/contact\/"/); assert.match(over, /href="\/uitleg\/"/);
    for (const p of ['index.html', 'privacy/index.html', 'contact/index.html', 'dartregels/index.html', 'club/index.html', 'club/uitnodiging/index.html', 'over/index.html']) {
      assert.match(dist(p), /<a href="\/over\/"[^>]*>Over OKKIE\.<\/a>/, p + ': Over OKKIE. in de footer');
      assert.match(dist(p), /dashboard\.denckh\.nl\/s\.js/, p + ': bezoekersteller');
    }
    assert.match(dist('sitemap.xml'), /okkiedarts\.nl\/over\//);
    assert.match(dist('appstore-badge-nl.svg'), /^<svg/);
    assert.doesNotMatch(dist('appstore-badge-nl.svg'), /<script/i);
  } finally { /* eigen map */ }
});

test('website (voorbeeld voor staging): Gericht oefenen, Vandaag oefenen en de officiële App Store-badge', () => {
  try {
    assert.match(build({ OKKIE_SITE_PREVIEW: '1' }), /VOORBEELD voor staging/);
    const home = dist('index.html');
    assert.match(home, /id="gericht"/);
    for (const t of ["Bob's 27", '121 Checkout', 'Rond de klok', 'Waarom?', 'weekdoel']) assert.ok(home.includes(t), t);
    assert.match(home, /<a class="appstore-badge" href="https:\/\/apps\.apple\.com\/nl\/app\/id6829301399"[^>]*><img src="\/appstore-badge-nl\.svg" alt="Download in de App Store"/);
    assert.doesNotMatch(home, /houd je reeks vast|<!--(IF|END):/);
  } finally { /* eigen map */ }
});
