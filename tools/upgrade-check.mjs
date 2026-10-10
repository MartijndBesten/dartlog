// Controleert een echte update: oude versie (map in argv[2]) → huidige versie, op hetzelfde adres.
// Gebruik: node tools/upgrade-check.mjs ../dartlog-old   (PW_CHANNEL=chromium in CI, standaard chrome)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const oldDir = resolve(process.argv[2]);
const port = 4190;
const cacheOf = dir => readFileSync(join(dir, 'sw.js'), 'utf8').match(/const VERSION = '([^']+)'/)[1];
const oldCache = cacheOf(oldDir), newCache = cacheOf(resolve('.'));
const url = `http://localhost:${port}/`;
const serve = dir => spawn(process.execPath, [join(dir, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${msg}`); if (!ok) process.exitCode = 1; };

let server = serve(oldDir);
await wait(800);
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'okkie-')), { channel: process.env.PW_CHANNEL || 'chrome', viewport: { width: 390, height: 844 } });
const page = ctx.pages()[0] || await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// 1. Oude versie gebruiken
await page.goto(url);
await page.fill('#wname', 'Senn');
await page.click("text=Let's play darts");
// tweede speler, daarna terug naar Senn
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('oche.data')); d.players.push({ id: 'p-mila', name: 'Mila', color: '#ffb000', createdAt: new Date().toISOString() }); localStorage.setItem('oche.data', JSON.stringify(d)); });
await page.reload();
await page.click('.action.train');
await page.click('[data-testid=start-score]');
for (let i = 0; i < 30; i++) await page.click('.nums [data-arg="20"]');
await page.click('.tabbar [data-go=train]');
await page.click('[data-testid=start-score]');
for (const n of ['5', '5', '5', '1']) await page.click(`.nums [data-arg="${n}"]`);
await page.evaluate(() => navigator.serviceWorker.ready);
check((await page.evaluate(() => caches.keys())).includes(oldCache), 'oude versie draait (' + oldCache + ')');

// 2. Nieuwe versie op hetzelfde adres
server.kill();
await wait(300);
server = serve(resolve('.'));
await wait(800);
await page.reload();
// wachten tot de nieuwe serviceworker is geïnstalleerd en actief
for (let i = 0; i < 40 && !(await page.evaluate(() => caches.keys())).includes(newCache); i++) await wait(250);
await page.evaluate(() => navigator.serviceWorker.ready);
await wait(500);
await page.reload();
check((await page.title()).includes('OKKIE'), 'nieuwe versie geladen (OKKIE)');
check(await page.getByTestId('live-total').textContent() === '15', 'lopende training is hervat (15 punten)');
check(await page.getByTestId('turn-total').textContent() === '1', 'open pijl van de lopende beurt is bewaard');
const d = await page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')));
check(d.trainings.length === 1 && d.trainings[0].turns.length === 10, 'afgeronde training van de oude versie is bewaard');
check(d.players.map(p => p.name).join() === 'Senn,Mila', 'beide spelers zijn bewaard (' + d.players.map(p => p.name).join() + ')');
const before = await page.evaluate(() => localStorage.getItem('oche.data'));
const caches = await page.evaluate(() => caches.keys());
check(caches.includes(newCache) && !caches.includes(oldCache), `cache bijgewerkt (${caches.join(', ')})`);
await page.click('[data-act=pause]');
await page.click('.tabbar [data-go=stats]');
check((await page.locator('.tile.hl strong').textContent()) === '60,00', 'statistieken van oude training kloppen (60,00)');

// 3. Offline na update: app én kinderuitleg, en de uitleg overschrijft de app niet
server.kill();
await ctx.setOffline(true);
await page.reload();
check(await page.getByTestId('live-total').textContent() === '15', 'werkt offline na update (lopende training zichtbaar)');
await page.goto(url + 'uitleg/');
check((await page.title()).includes('Zo werkt OKKIE'), 'kinderuitleg werkt offline na update');
for (const name of [/TRIPLE 20/, /^5 5 punten$/, /DOUBLE 10/]) await page.getByRole('button', { name }).click();
check(await page.locator('#demo-total').textContent() === '85', 'oefenbeurt in de uitleg werkt offline (85)');
check(await page.evaluate(() => localStorage.getItem('oche.data')) === before, 'oefenbeurt verandert geen echte gegevens');
await page.goto(url);
check(await page.getByTestId('live-total').textContent() === '15', 'app opent offline weer na de uitleg (geen verwisselde pagina)');
const manifest = await page.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()).short_name);
check(manifest === 'OKKIE.', 'manifest uit cache heet OKKIE');
check(!errors.length, 'geen JavaScript-fouten' + (errors.length ? ': ' + errors.join(' | ') : ''));
await ctx.close();
