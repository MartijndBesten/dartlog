// Releasewaarborgen: versies kloppen, de offline cache is compleet, registratie staat dicht
// en de website-build zet geen tweede app op okkiedarts.nl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = file => readFileSync(join(root, file), 'utf8');
const APP = 'https://martijndbesten.github.io/dartlog/';
// Enige toegestane externe bestemmingen vanaf okkiedarts.nl.
const EXTERNAL = [APP, APP + 'community/', 'https://denckh.nl/', 'https://okkiedarts.nl/privacy/', 'https://okkiedarts.nl/contact/',
  'https://autoriteitpersoonsgegevens.nl/', 'mailto:info@denckh.nl', 'mailto:info@denckh.nl?subject=OKKIE.'];
const PAGES = ['index.html', 'uitleg/index.html', 'privacy/index.html', 'contact/index.html'];

test('versie is overal gelijk: sw.js, app en package.json', () => {
  const pkg = JSON.parse(read('package.json')).version;
  const sw = read('sw.js').match(/const VERSION = 'okkie-v([^']+)'/)[1];
  const app = read('js/app.js').match(/APP_VERSION = '([^']+)'/)[1];
  assert.equal(sw, pkg);
  assert.equal(app, pkg);
  assert.match(read('CHANGELOG.md'), new RegExp('^## ' + pkg.replaceAll('.', '\\.') + '\\b', 'm'));
});

test('serviceworker: elk vooraf bewaard bestand bestaat, gebruikersgegevens blijven onaangeroerd', () => {
  const sw = read('sw.js');
  const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(assets.length > 20);
  for (const a of assets) {
    const file = a.endsWith('/') ? a + 'index.html' : a;
    assert.ok(existsSync(join(root, file)), `ontbreekt in de app: ${a}`);
  }
  assert.doesNotMatch(sw.replace(/\/\/.*$/gm, ''), /localStorage|indexedDB/, 'de serviceworker raakt opgeslagen trainingen niet aan');
  // Alleen eigen oude caches worden opgeruimd.
  assert.match(sw, /k\.startsWith\('okkie-'\) \|\| k\.startsWith\('oche-'\)\) && k !== VERSION/);
});

test('openbare registratie staat dicht in de app en in de Worker-configuratie', async () => {
  const config = await import(new URL('../../community/config.js', import.meta.url));
  assert.equal(config.REGISTRATION_OPEN, false);
  const toml = read('cloud/wrangler.toml');
  assert.equal((toml.match(/^REGISTRATION_ENABLED = "false"\r?$/gm) || []).length, 2);
});

test('website-build: alleen website en uitleg, geen tweede app, links naar de juiste omgeving', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  const dist = join(root, 'dist');
  const files = readdirSync(dist, { recursive: true }).map(f => String(f).replaceAll('\\', '/'));
  for (const f of ['index.html', 'site.css', 'site.js', 'favicon-32.png', '_headers', 'robots.txt', 'sitemap.xml',
    'privacy/index.html', 'contact/index.html', 'uitleg/index.html', 'uitleg/uitleg.css', 'uitleg/uitleg.js', 'uitleg/score-oefening.js']) {
    assert.ok(files.includes(f), `ontbreekt: ${f}`);
  }
  for (const f of files) {
    assert.doesNotMatch(f, /^(app|js|css|community|icons)\/|^sw\.js$|manifest/, `hoort niet op okkiedarts.nl: ${f}`);
  }
  for (const page of PAGES) {
    const html = readFileSync(join(dist, page), 'utf8');
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    for (const ref of refs) {
      assert.doesNotMatch(ref, /^\.\.\//, `${page}: verwijzing buiten de site: ${ref}`);
      if (/^(https?|mailto):/.test(ref)) assert.ok(EXTERNAL.includes(ref), `${page}: onbekende externe link ${ref}`);
    }
    assert.ok(refs.includes(APP), `${page} linkt naar de bestaande app`);
    assert.doesNotMatch(html, /serviceWorker|manifest\.webmanifest/, `${page} installeert geen tweede PWA`);
  }
});

test('juridisch: elke pagina toont maker, privacy en contact; geen privételefoon of -adres', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  for (const page of PAGES) {
    const html = readFileSync(join(root, 'dist', page), 'utf8');
    assert.match(html, /Ontwikkeld door <a[^>]+href="https:\/\/denckh\.nl\/"/, `${page}: Denckh. met link`);
    assert.match(html, /href="(\/|https:\/\/okkiedarts\.nl\/)privacy\/"/, `${page}: link naar privacy`);
    assert.match(html, /href="(\/|https:\/\/okkiedarts\.nl\/)contact\/"/, `${page}: link naar contact`);
    const text = html.replace(/<[^>]+>/g, ' ');
    // Telefoonnummer of postcode alleen na uitdrukkelijke toestemming van de eigenaar; pas dan deze test aan.
    assert.doesNotMatch(text, /(\+31|\b0\d)[\s-]?\d([\s-]?\d){7}\b/, `${page}: telefoonnummer`);
    assert.doesNotMatch(text, /\b[1-9]\d{3}\s?[A-Z]{2}\b/, `${page}: postcode`);
    assert.doesNotMatch(html, /[a-z0-9._-]+@(?!denckh\.nl)[a-z0-9-]+\.[a-z]{2,}/i, `${page}: alleen info@denckh.nl als e-mail`);
  }
  const contact = readFileSync(join(root, 'dist/contact/index.html'), 'utf8');
  assert.match(contact, /mailto:info@denckh\.nl/);
  for (const label of ['KvK-nummer', 'Btw-identificatienummer']) assert.ok(contact.includes(`<dt>${label}</dt>`), `contact: ${label}`);
  // Bewuste keuze van de eigenaar: geen openbaar (woon)adres op de site.
  for (const page of PAGES) assert.ok(!readFileSync(join(root, 'dist', page), 'utf8').includes('<dt>Adres</dt>'), `${page}: geen adres`);
  const privacy = readFileSync(join(root, 'dist/privacy/index.html'), 'utf8');
  for (const topic of ['Wie is verantwoordelijk', 'Hosting', 'Cloudflare', 'GitHub', 'Kinderen', 'Jouw rechten', 'Autoriteit Persoonsgegevens', 'registratie staat uit']) {
    assert.ok(privacy.includes(topic), `privacyverklaring noemt: ${topic}`);
  }
});

test('launch-check herkent open velden', async () => {
  const { pendingFields } = await import('../../tools/launch-check.mjs');
  assert.deepEqual(pendingFields('<dd><span data-pending="kvk">volgt</span></dd><span data-pending="btw"></span>'), ['kvk', 'btw']);
  assert.deepEqual(pendingFields('<dd>12345678</dd>'), []);
});

test('website-worker: www en http naar https://okkiedarts.nl, pad blijft, beveiligingsheaders', async () => {
  const { default: site, HEADERS } = await import('../../ontdek/pages-worker.js');
  const env = { ASSETS: { fetch: async () => new Response('ok', { status: 200, headers: { 'Content-Type': 'text/html' } }) } };
  for (const from of ['https://www.okkiedarts.nl/uitleg/?x=1', 'http://okkiedarts.nl/uitleg/?x=1', 'http://www.okkiedarts.nl/uitleg/?x=1']) {
    const r = await site.fetch(new Request(from), env);
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.get('Location'), 'https://okkiedarts.nl/uitleg/?x=1', from);
  }
  const r = await site.fetch(new Request('https://okkiedarts.nl/privacy/'), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  for (const [k, v] of Object.entries(HEADERS)) assert.equal(r.headers.get(k), v, k);
  // pages.dev-voorbeeldadres blijft gewoon werken (geen doorverwijzing)
  assert.equal((await site.fetch(new Request('https://okkiedarts.pages.dev/'), env)).status, 200);
  const files = readdirSync(join(root, 'dist'));
  assert.ok(files.includes('_worker.js') && files.includes('google873828225866c738.html'));
});
