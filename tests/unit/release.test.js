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
    'uitleg/index.html', 'uitleg/uitleg.css', 'uitleg/uitleg.js', 'uitleg/score-oefening.js']) {
    assert.ok(files.includes(f), `ontbreekt: ${f}`);
  }
  for (const f of files) {
    assert.doesNotMatch(f, /^(app|js|css|community|icons)\/|^sw\.js$|manifest/, `hoort niet op okkiedarts.nl: ${f}`);
  }
  for (const page of ['index.html', 'uitleg/index.html']) {
    const html = readFileSync(join(dist, page), 'utf8');
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    for (const ref of refs) {
      assert.doesNotMatch(ref, /^\.\.\//, `${page}: verwijzing buiten de site: ${ref}`);
      if (/^https?:/.test(ref)) assert.ok([APP, APP + 'community/'].includes(ref), `${page}: onbekende externe link ${ref}`);
    }
    assert.ok(refs.includes(APP), `${page} linkt naar de bestaande app`);
    assert.doesNotMatch(html, /serviceWorker|manifest\.webmanifest/, `${page} installeert geen tweede PWA`);
  }
});
