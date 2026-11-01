// Releasewaarborgen: versies kloppen, de offline cache is compleet, registratie staat dicht
// en de website-build zet geen tweede app op okkiedarts.nl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rulesPage } from '../../js/rules.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = file => readFileSync(join(root, file), 'utf8');
const APP = 'https://app.okkiedarts.nl/';
// Enige toegestane externe bestemmingen vanaf okkiedarts.nl.
const EXTERNAL = [APP, APP + 'community/', 'https://denckh.nl/', 'https://okkiedarts.nl/privacy/', 'https://okkiedarts.nl/contact/',
  // canonieke adressen van de pagina's zelf
  'https://okkiedarts.nl/', 'https://okkiedarts.nl/uitleg/', 'https://okkiedarts.nl/dartregels/',
  // OKKIE. Club voor verenigingen: canoniek adres en aanmelden als proefclub per mail (geen formulier)
  'https://okkiedarts.nl/club/', 'mailto:info@denckh.nl?subject=Proefclub%20OKKIE.%20Club', APP + 'club/', 'mailto:info@denckh.nl?subject=OKKIE.%20Club',
  'mailto:info@denckh.nl?subject=Proefclub%20OKKIE.%20Club&amp;body=Onze%20vereniging%20wil%20graag%20proefclub%20worden.%0A%0ANaam%20vereniging%3A%0AAantal%20leden%20(ongeveer)%3A%0AContactpersoon%3A%0A',
  // bronnen van de dartregels (js/rules.js)
  'https://dartswdf.com/rules', 'https://www.thedra.co.uk/dra-rulebook',
  'https://autoriteitpersoonsgegevens.nl/', 'mailto:info@denckh.nl', 'mailto:info@denckh.nl?subject=OKKIE.',
  // cookieloze bezoekersteller van Denckh (alleen op de website, nooit in de app)
  'https://dashboard.denckh.nl/s.js'];
const COUNTER = '<script defer src="https://dashboard.denckh.nl/s.js" data-brand="okkie"></script>';
const PAGES = ['index.html', 'uitleg/index.html', 'privacy/index.html', 'contact/index.html', 'dartregels/index.html', 'club/index.html', 'club/uitnodiging/index.html'];

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
  // 1.5.0: Darters aan, Mijn vrienden uit (gegevens blijven); groepsroutes voor jonger dan 16 blijven dicht.
  assert.equal(config.GROUPS_OPEN, false);
  assert.equal(config.DARTERS_OPEN, true);
  assert.equal((read('cloud/wrangler.toml').match(/^DARTERS_ENABLED = "true"\r?$/gm) || []).length, 2);
  assert.equal((read('cloud/wrangler.toml').match(/^GROUPS_ENABLED = "false"\r?$/gm) || []).length, 2);
  assert.equal(config.MINORS_OPEN, false);
  assert.match(config.API_BASE, /^https:\/\/okkie-api\.[a-z0-9-]+\.workers\.dev$/);
  assert.doesNotMatch(read('cloud/wrangler.toml'), /^MINORS_OPEN = "true"/m);
  const toml = read('cloud/wrangler.toml');
  assert.equal((toml.match(/^REGISTRATION_ENABLED = "false"\r?$/gm) || []).length, 2);
});

test('website-build: alleen website en uitleg, geen tweede app, links naar de juiste omgeving', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  const dist = join(root, 'dist');
  const files = readdirSync(dist, { recursive: true }).map(f => String(f).replaceAll('\\', '/'));
  for (const f of ['index.html', 'site.css', 'site.js', 'favicon-32.png', '_headers', 'robots.txt', 'sitemap.xml',
    'privacy/index.html', 'contact/index.html', 'dartregels/index.html', 'uitleg/index.html', 'uitleg/uitleg.css', 'uitleg/uitleg.js', 'uitleg/score-oefening.js']) {
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
    // Denckh-merkregel: officieel signatuurlogo met krul, kleine roltekst, geen kaal getypte "Denckh." en geen pijltje.
    assert.match(html, /<a class="maker" href="https:\/\/denckh\.nl\/"[^>]*><span class="maker-role">Ontwikkeld door<\/span><img src="\/denckh-logo-signature-light\.svg" alt="Denckh"/, `${page}: Denckh-signatuur`);
    assert.doesNotMatch(html, /<strong>Denckh\.<\/strong>|Denckh\.<\/strong> <span aria-hidden="true">↗/, `${page}: geen getypt makerlabel`);
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
  for (const topic of ['Wie is verantwoordelijk', 'Hosting', 'Cloudflare', 'GitHub', 'Kinderen', 'Jouw rechten', 'Autoriteit Persoonsgegevens', 'Darters', 'Uitzetten en wissen', 'ouder of verzorger']) {
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
  assert.ok(files.includes('google873828225866c738.html') && !files.includes('_worker.js'));
});

test('website-worker levert het Google-verificatiebestand zelf, zonder doorverwijzing', async () => {
  const { default: site } = await import('../../ontdek/pages-worker.js');
  const env = { ASSETS: { fetch: async () => new Response('', { status: 307, headers: { Location: '/google873828225866c738' } }) } };
  const r = await site.fetch(new Request('https://okkiedarts.nl/google873828225866c738.html'), env);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'google-site-verification: google873828225866c738.html');
});

test('Denckh-signatuur: originele merkassets (ongewijzigd) en overal in app en site gebruikt', async () => {
  const { createHash } = await import('node:crypto');
  const sha = f => createHash('sha256').update(readFileSync(join(root, f))).digest('hex');
  // Ongewijzigde bestanden uit MartijndBesten/denckh public/brand/ (commit 01c66eb).
  assert.equal(sha('icons/denckh-logo-signature-light.svg'), '20bbb812a15920f38e15fcec68aad74de930197b33ae33a22fd7557ac4c09b97');
  assert.equal(sha('icons/denckh-logo-signature.svg'), 'b8322458ef7f5b654da730d3c8cd02428eaa5e469e6aedd73479136a7eb1712f');
  const app = read('js/app.js');
  assert.equal((app.match(/class="maker"/g) || []).length, 2, 'welkomstscherm en Meer');
  assert.doesNotMatch(app, /<b>Denckh\.<\/b>/);
  assert.match(read('community/index.html'), /<img src="\.\.\/icons\/denckh-logo-signature-light\.svg" alt="Denckh"/);
});

test('OKKIE.-logo: één woordmerk (O met dubbele ring en pijl, KKIE, ronde stip) op alle websitepagina\'s', () => {
  for (const page of PAGES) {
    const html = readFileSync(join(root, 'dist', page), 'utf8');
    assert.match(html, /<img class="logo-img" src="\/logo\.svg" alt="OKKIE\."/, page);
    assert.doesNotMatch(html, /◎KKIE|class="bull">◎|>KKIE<span/, page);
  }
  assert.match(read('icons/okkie-o.svg'), /<title>O van OKKIE\./);
  const logo = read('icons/logo.svg');
  assert.match(logo, /<circle cx="358" cy="77" r="9\.5"/, 'ronde stip');
  assert.doesNotMatch(logo, /<text|font-family/, 'woordmerk als vectorpad, onafhankelijk van lettertypen');
});

// PNG-afmetingen uit de IHDR-kop, JPEG uit de SOF-marker.
function pngSize(file) { const b = readFileSync(join(root, file)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
function jpegSize(file) {
  const b = readFileSync(join(root, file));
  for (let i = 2; i < b.length;) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

test('app-iconen en favicons in de juiste formaten, ook voor iPhone en Android', () => {
  for (const [f, n] of [['icons/favicon-16.png', 16], ['icons/favicon-32.png', 32], ['icons/favicon-48.png', 48], ['icons/apple-touch-icon.png', 180], ['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/icon-maskable-512.png', 512]]) {
    assert.deepEqual(pngSize(f), [n, n], f);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const sizes = manifest.icons.map(i => i.sizes + ':' + i.purpose);
  for (const need of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(sizes.includes(need), need);
  for (const i of manifest.icons) assert.ok(existsSync(join(root, i.src)), i.src);
  const html = read('index.html');
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="icon" href="icons\/favicon\.svg" type="image\/svg\+xml">/);
  assert.equal(manifest.name, 'OKKIE.');
});

test('WhatsApp-voorvertoning: Open Graph en Twitter Card met absolute HTTPS-afbeelding van 1200 x 630', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  assert.deepEqual(jpegSize('dist/og-image.jpg'), [1200, 630]);
  assert.ok(readFileSync(join(root, 'dist/og-image.jpg')).length < 300 * 1024, 'klein genoeg voor WhatsApp (< 300 kB)');
  for (const page of PAGES) {
    const html = readFileSync(join(root, 'dist', page), 'utf8');
    const meta = name => (html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`)) || [])[1];
    assert.equal(meta('og:image'), 'https://okkiedarts.nl/og-image.jpg', page);
    assert.equal(meta('og:image:width'), '1200', page);
    assert.equal(meta('og:image:height'), '630', page);
    assert.ok(meta('og:title')?.includes('OKKIE.'), page);
    assert.ok(meta('og:description')?.length > 40, page);
    assert.match(meta('og:url') || '', /^https:\/\/okkiedarts\.nl\//, page);
    assert.equal(meta('twitter:card'), 'summary_large_image', page);
  }
  assert.match(read('index.html'), /<meta property="og:image" content="https:\/\/okkiedarts\.nl\/og-image\.jpg">/, 'ook de app heeft een voorvertoning');
});

test('app-build voor app.okkiedarts.nl: alleen de app, met CNAME, en de verhuizing staat standaard uit', async () => {
  execFileSync(process.execPath, [join(root, 'tools/build-app-site.mjs')], { cwd: root, stdio: 'pipe' });
  const dist = join(root, 'dist-app');
  assert.equal(readFileSync(join(dist, 'CNAME'), 'utf8').trim(), 'app.okkiedarts.nl');
  const files = readdirSync(dist, { recursive: true }).map(f => String(f).replaceAll('\\', '/'));
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'js/app.js', 'js/transfer.js', 'js/install.js', 'icons/icon-512.png', 'uitleg/index.html', '.nojekyll']) assert.ok(files.includes(f), 'ontbreekt: ' + f);
  for (const f of files) assert.doesNotMatch(f, /^(cloud|tests|tools|node_modules)\/|\.md$(?<!README\.md)|package/, 'hoort niet in de app-publicatie: ' + f);
  // Dezelfde app als op het oude adres: bestanden byte-gelijk
  for (const f of ['index.html', 'sw.js', 'js/app.js', 'css/app.css']) assert.equal(readFileSync(join(dist, f), 'utf8'), read(f), f);
  // Community-pagina: stijl aanwezig, geen verwijzing naar een websitekopie op het app-adres
  assert.ok(files.includes('ontdek/site.css'));
  assert.ok(!files.includes('ontdek/index.html'), 'geen kopie van de website op app.okkiedarts.nl');
  assert.doesNotMatch(readFileSync(join(dist, 'community/index.html'), 'utf8'), /href="\.\.\/ontdek\/"/);
  const { PROD } = await import(new URL('../../js/transfer.js', import.meta.url));
  // Stap 7 (VERHUIZING.md) aangekondigd; sinds 1.6.2 stuurt het oude adres door (besluit eigenaar, één gebruiker).
  assert.equal(PROD.open, true);
  assert.equal(PROD.forwarded, true);
  // Het oude adres krijgt nooit een eigen domein (dat zou automatisch doorverwijzen).
  assert.ok(!existsSync(join(root, 'CNAME')), 'geen CNAME in de dartlog-repo');
  const { INSTALL_ORIGINS } = await import(new URL('../../js/install.js', import.meta.url));
  assert.deepEqual(INSTALL_ORIGINS, ['https://app.okkiedarts.nl']);
});

test('app-build in testfase: niet vindbaar voor zoekmachines, verder dezelfde app', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-app-site.mjs')], { cwd: root, stdio: 'pipe', env: { ...process.env, OKKIE_APP_STAGE: 'test' } });
  const dist = join(root, 'dist-app');
  const index = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.match(index, /<meta name="robots" content="noindex, nofollow">/);
  assert.equal(index.replace('\n  <meta name="robots" content="noindex, nofollow">', ''), read('index.html'));
  assert.equal(readFileSync(join(dist, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  for (const f of ['sw.js', 'js/app.js', 'js/transfer.js']) assert.equal(readFileSync(join(dist, f), 'utf8'), read(f), f);
  // weer terug naar de gewone build, zodat andere tests niet van de testfase afhangen
  execFileSync(process.execPath, [join(root, 'tools/build-app-site.mjs')], { cwd: root, stdio: 'pipe' });
});

// Sinds 1.6.2: het oude adres stuurt door. Alleen daar; op app.okkiedarts.nl, okkiedarts.nl en localhost gebeurt niets.
test('oude adres stuurt door naar app.okkiedarts.nl (website-pagina\'s naar okkiedarts.nl), nergens anders', async () => {
  const { runInNewContext } = await import('node:vm');
  const pages = ['index.html', 'community/index.html', 'uitleg/index.html', 'vrienden/index.html', 'ontdek/index.html', 'ontdek/privacy/index.html', 'ontdek/contact/index.html'];
  const scripts = pages.map(p => read(p).match(/<script>(\/\* Oude adres martijndbesten[\s\S]*?)<\/script>/)?.[1]);
  scripts.forEach((js, i) => assert.ok(js, 'doorstuurscript ontbreekt in ' + pages[i]));
  assert.equal(new Set(scripts).size, 1, 'overal hetzelfde script');
  const go = href => { const u = new URL(href); let to = null; runInNewContext(scripts[0], { location: { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, replace: x => { to = x; } } }); return to; };
  assert.equal(go('https://martijndbesten.github.io/dartlog/'), 'https://app.okkiedarts.nl/');
  assert.equal(go('https://martijndbesten.github.io/dartlog'), 'https://app.okkiedarts.nl/');
  assert.equal(go('https://martijndbesten.github.io/dartlog/community/#ouder=ab12'), 'https://app.okkiedarts.nl/community/#ouder=ab12', 'ouderlink blijft werken');
  assert.equal(go('https://martijndbesten.github.io/dartlog/#overzetten'), 'https://app.okkiedarts.nl/');
  assert.equal(go('https://martijndbesten.github.io/dartlog/uitleg/'), 'https://app.okkiedarts.nl/uitleg/');
  assert.equal(go('https://martijndbesten.github.io/dartlog/ontdek/privacy/'), 'https://okkiedarts.nl/privacy/');
  assert.equal(go('https://martijndbesten.github.io/dartlog/ontdek/'), 'https://okkiedarts.nl/');
  for (const other of ['https://app.okkiedarts.nl/', 'https://app.okkiedarts.nl/community/', 'https://okkiedarts.nl/', 'http://localhost:4173/', 'https://martijndbesten.github.io/iets-anders/'])
    assert.equal(go(other), null, 'geen doorsturen op ' + other);
});

test('gratis en reclamevrij: de website zegt het, en in de app en op de site is niets te koop (besluit eigenaar)', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  const dist = join(root, 'dist');
  const landing = readFileSync(join(dist, 'index.html'), 'utf8');
  for (const t of ['Geen reclame', 'Geen aankopen in de app', 'geen aankopen in de app']) assert.ok(landing.includes(t), 'website noemt: ' + t);
  assert.ok(!existsSync(join(dist, 'steun')), 'geen steun- of betaalpagina');
  for (const page of PAGES) assert.doesNotMatch(readFileSync(join(dist, page), 'utf8'), /steun okkie|mollie|betaallink|payment-links/i, page + ': geen steun of betalen');
  assert.match(read('js/app.js'), /geen reclame en geen aankopen in de app/);
  for (const f of readdirSync(join(root, 'js'), { recursive: true }).map(String).filter(f => /\.m?js$/.test(f))) assert.doesNotMatch(read('js/' + f.replaceAll('\\', '/')), /mollie|PaymentRequest|in-app-?purchase|steun okkie/i, 'js/' + f + ': geen betalen of steun in de app');
});

test('dartregels op de website: letterlijk dezelfde tekst en tekening als in de app, overal gelinkt', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  const html = readFileSync(join(root, 'dist/dartregels/index.html'), 'utf8');
  assert.doesNotMatch(html, /<!--RULES-->/, 'plek voor de regels is ingevuld');
  assert.ok(html.includes(rulesPage()), 'website gebruikt de tekst en tekening van js/rules.js');
  assert.match(html, /<svg class="rules-drawing"/);
  for (const t of ['1,73 m', '2,37 m', '2,934 m', 'Dubbel uitgooien', 'Bust', 'dartswdf.com/rules']) assert.ok(html.includes(t), t);
  assert.match(html, /href="https:\/\/app\.okkiedarts\.nl\/"/, 'linkt naar de app');
  const landing = readFileSync(join(root, 'dist/index.html'), 'utf8');
  assert.match(landing, /<nav aria-label="Navigatie">[\s\S]*href="\/dartregels\/"/, 'in de navigatie');
  assert.match(landing, /Hoe hang ik een dartbord op\?[^]*?href="\/dartregels\/"/, 'vanuit de vraag');
  for (const page of PAGES.filter(p => p !== 'uitleg/index.html')) assert.match(readFileSync(join(root, 'dist', page), 'utf8'), /href="\/dartregels\/"/, page + ': link naar dartregels');
  assert.match(readFileSync(join(root, 'dist/sitemap.xml'), 'utf8'), /okkiedarts\.nl\/dartregels\//);
  assert.match(read('js/app.js'), /okkiedarts\.nl\/dartregels\//, 'de app verwijst naar de website');
});

test('offline: elke module die de app laadt, staat in de lijst van de serviceworker', () => {
  const sw = read('sw.js');
  const assets = new Set([...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  const seen = new Set(), todo = ['js/boot.js', 'js/app.js'];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of read(f).matchAll(/^import[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)) todo.push(join(f, '..', m[1]).replaceAll('\\', '/'));
  }
  assert.ok(seen.has('js/stat-prefs.js') && seen.has('js/turn-chart.js'));
  for (const f of seen) assert.ok(assets.has('./' + f), `niet offline beschikbaar: ${f}`);
});

test('bezoekersteller: precies één keer op elke websitepagina, nooit in de app, privacy legt het uit', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  for (const page of PAGES) {
    const html = readFileSync(join(root, 'dist', page), 'utf8');
    assert.equal(html.split(COUNTER).length - 1, 1, `${page}: teller precies één keer`);
    assert.ok(html.indexOf(COUNTER) < html.indexOf('</head>'), `${page}: teller in de head`);
  }
  // Bronpagina's (ook uitleg/, die in de app zit) blijven zonder teller.
  for (const f of ['index.html', 'uitleg/index.html', 'community/index.html', 'vrienden/index.html', 'ontdek/index.html', 'ontdek/privacy/index.html']) {
    assert.doesNotMatch(read(f), /dd-marketing|dashboard\.denckh\.nl\/s\.js/, `${f}: geen teller in de bron`);
  }
  execFileSync(process.execPath, [join(root, 'tools/build-app-site.mjs')], { cwd: root, stdio: 'pipe' });
  const app = join(root, 'dist-app');
  for (const f of readdirSync(app, { recursive: true }).map(String).filter(f => /.(html|js)$/.test(f))) {
    assert.doesNotMatch(readFileSync(join(app, f), 'utf8'), /dd-marketing|dashboard\.denckh\.nl\/s\.js/, `app ${f}: geen teller`);
  }
  const privacy = readFileSync(join(root, 'dist/privacy/index.html'), 'utf8');
  assert.match(privacy, /id="bezoekersteller"/);
  assert.match(privacy, /zonder cookies en zonder persoonsgegevens geteld/);
  assert.match(privacy, /De app wordt hiermee niet gevolgd/);
  assert.doesNotMatch(privacy, /geen analyse- of advertentiediensten en geen lettertypen of scripts van derden/);
});

test('okkiedarts.nl/club: OKKIE. Club live, "Start gratis een club" naar de app, Club in de navigatie, uitnodigingspagina', () => {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { cwd: root, stdio: 'pipe' });
  const html = readFileSync(join(root, 'dist/club/index.html'), 'utf8');
  for (const t of ['OKKIE. Club voor dartverenigingen', 'NIEUW', 'Start gratis een club', 'Weekoefening', 'clubranglijst', 'Eigen clubnaam en logo', 'Eigen trainingen maken', 'Beheerder', 'Captain', 'Lid', 'fictieve gegevens']) assert.ok(html.includes(t), t);
  assert.doesNotMatch(html, /BINNENKORT|nog niet beschikbaar|proefclub/i);
  assert.match(html, /href="https:\/\/app\.okkiedarts\.nl\/club\/"/);
  for (const p of ['index.html', 'privacy/index.html', 'contact/index.html', 'dartregels/index.html', 'club/index.html']) assert.match(readFileSync(join(root, 'dist', p), 'utf8'), /<nav[^>]*>\s*<a href="\/club\/">Club<\/a>/, p + ': Club in de navigatie');
  const inv = readFileSync(join(root, 'dist/club/uitnodiging/index.html'), 'utf8');
  assert.match(inv, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(inv, /location\.hash\.match\(\/club=/);
  assert.match(inv, /\/v1\/clubs\/preview/);
  assert.match(inv, /'https:\/\/app\.okkiedarts\.nl\/club\/#club=' \+ code/);
  assert.match(inv, /textContent = d\.club\.name/, 'clubnaam als tekst (geen HTML)');
  assert.doesNotMatch(readFileSync(join(root, 'dist/sitemap.xml'), 'utf8'), /uitnodiging/);
  assert.match(readFileSync(join(root, 'dist/privacy/index.html'), 'utf8'), /<h2 id="club">6a\. OKKIE\. Club/, 'privacyverklaring met Club-paragraaf');
  assert.doesNotMatch(html, /<form|<input|fetch\(|action=/i, 'geen formulier: aanmelden per mail');
  for (const img of ['club-weekoefening.webp', 'club-trainingen.webp', 'club-profiel.webp']) assert.ok(existsSync(join(root, 'dist/club', img)), img);
  assert.match(readFileSync(join(root, 'dist/index.html'), 'utf8'), /href="\/club\/"/, 'beginpagina linkt naar de clubpagina');
  assert.match(readFileSync(join(root, 'dist/sitemap.xml'), 'utf8'), /okkiedarts\.nl\/club\//);
});
