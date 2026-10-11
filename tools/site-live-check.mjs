// Controleert de echte publicatie op okkiedarts.nl: node tools/site-live-check.mjs
// HTTPS, hoofddomein, www-doorverwijzing, uitleg, privacy, contact, API (registratie dicht),
// beheer niet publiek, geen adres/geheimen/testgegevens. App: zie tools/live-check.mjs.
import { chromium } from '@playwright/test';

const SITE = 'https://okkiedarts.nl';
const API = 'https://api.okkiedarts.nl';
const APP = 'https://app.okkiedarts.nl/';
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${msg}`); if (!ok) process.exitCode = 1; };
const get = (url, opts = {}) => fetch(url, { redirect: 'manual', ...opts }).catch(e => ({ status: 0, error: e, headers: new Headers(), text: async () => '' }));

// HTTPS en doorverwijzingen
const http = await get('http://okkiedarts.nl/');
check([301, 302, 307, 308].includes(http.status) && (http.headers.get('location') || '').startsWith('https://okkiedarts.nl'), `http → https (${http.status} ${http.headers.get('location')})`);
for (const www of ['https://www.okkiedarts.nl/', 'https://www.okkiedarts.nl/uitleg/']) {
  const r = await get(www);
  const loc = r.headers.get('location') || '';
  check([301, 308].includes(r.status) && loc.startsWith('https://okkiedarts.nl/'), `www → okkiedarts.nl (${www}: ${r.status} ${loc})`);
}

// Pagina's: bereikbaar, juiste inhoud, geen adres, geen geheimen of testgegevens
const pages = { '/': 'Elke pijl telt', '/uitleg/': 'Zo werkt OKKIE', '/privacy/': 'Jouw pijlen blijven van jou', '/contact/': 'info@denckh.nl' };
for (const [path, marker] of Object.entries(pages)) {
  const r = await get(SITE + path);
  const html = await r.text();
  check(r.status === 200 && html.includes(marker), `${path} bereikbaar (${r.status})`);
  check(!/<dt>Adres<\/dt>|\b[1-9]\d{3}\s?[A-Z]{2}\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), `${path}: geen adres of postcode`);
  check(!/TURNSTILE_SECRET|CF_ACCESS|ADMIN_ALLOWED|BEGIN (RSA )?PRIVATE|api[_-]?key|localhost|127\.0\.0\.1|Senn/i.test(html), `${path}: geen geheimen of testgegevens`);
  check(r.headers.get('x-content-type-options') === 'nosniff', `${path}: beveiligingsheaders`);
}
for (const path of ['/app/', '/sw.js', '/manifest.webmanifest', '/community/']) {
  check((await get(SITE + path)).status === 404, `geen app-kopie: ${path} bestaat niet`);
}

// API: gezond, registratie dicht, ranglijst werkt, beheer niet via api-domein
const health = await (await get(API + '/v1/health')).json?.().catch(() => null);
check(health?.ok === true && health.registration === false, `API gezond, registratie dicht (${JSON.stringify(health)})`);
const reg = await get(API + '/v1/register', { method: 'POST', headers: { Origin: 'https://okkiedarts.nl', 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: 'Controle', share: true, ageConsent: true, turnstileToken: 'x' }) });
check(reg.status === 403, `registratie geweigerd (${reg.status})`);
check((await get(API + '/v1/leaderboard?period=week')).status === 200, 'ranglijst bereikbaar');
check((await get(API + '/beheer')).status === 404, 'beheer niet bereikbaar via api.okkiedarts.nl');
const beheer = await get('https://beheer.okkiedarts.nl/beheer');
check(beheer.status === 0 || beheer.status === 404 || beheer.status === 403 || [302, 303].includes(beheer.status), `beheer.okkiedarts.nl dicht (${beheer.status || 'bestaat niet'})`);

// Browser: animaties draaien zonder fouten, links naar de bestaande app
const b = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.goto(SITE + '/');
await p.locator('[data-demo]').scrollIntoViewIfNeeded();
await p.waitForSelector('[data-demo].done', { timeout: 8000 }).catch(() => {});
check(await p.locator('[data-demo].done').count() === 1, 'demo-beurt speelt af');
check(await p.locator('a.nav-cta').getAttribute('href') === APP, 'knop opent de bestaande app');
await p.goto(SITE + '/uitleg/');
for (const name of [/TRIPLE 20/, /^5 5 punten$/, /DOUBLE 10/]) await p.getByRole('button', { name }).click();
check(await p.locator('#demo-total').textContent() === '85', 'kinderuitleg: oefenbeurt werkt');
check(await p.evaluate(() => localStorage.length) === 0, 'kinderuitleg slaat niets op');
check(!errors.length, 'geen JavaScript-fouten' + (errors.length ? ': ' + errors.join(' | ') : ''));
await b.close();
