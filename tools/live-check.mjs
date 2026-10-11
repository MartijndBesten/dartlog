// Controleert de echte onlineversie: node tools/live-check.mjs [url]
import { chromium, devices } from '@playwright/test';

const url = process.argv[2] || 'https://app.okkiedarts.nl/';
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${msg}`); if (!ok) process.exitCode = 1; };
// Lokaal Chrome; in een omgeving zonder Chrome: OKKIE_CHROMIUM=/pad/naar/chromium (en eventueel HTTPS_PROXY).
const b = await chromium.launch(process.env.OKKIE_CHROMIUM
  ? { executablePath: process.env.OKKIE_CHROMIUM, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined }
  : { channel: 'chrome' });
const ctx = await b.newContext({ ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
// Tikritme ≥ 35 ms: de app negeert dezelfde toets sneller dan dat als spook-tik.
const key = async n => { await p.click(`.nums [data-arg="${n}"], .specials [data-arg="${n}"]`); await p.waitForTimeout(60); };

await p.goto(url);
check((await p.title()) === 'OKKIE. · darttrainer', 'titel OKKIE.');
check((await p.locator('.tagline').textContent()) === 'Gooi. Scoor. Word beter.', 'onderschrift');
await p.fill('#wname', 'Test');
await p.click("text=Let's play darts");
// Op app.okkiedarts.nl krijgt een nieuwe gebruiker het installatieadvies; op het oude adres niet.
const sheet = p.getByTestId('install-sheet');
if (await sheet.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
  check(new URL(url).hostname === 'app.okkiedarts.nl', 'installatieadvies voor een nieuwe gebruiker (hoort alleen op app.okkiedarts.nl)');
  await p.getByRole('button', { name: 'Eerst proberen' }).click();
} else check(new URL(url).hostname !== 'app.okkiedarts.nl', 'geen installatieadvies (hoort alleen op app.okkiedarts.nl)');
await p.click('.action.train');
await p.click('[data-testid=add-player]');
await p.fill('[data-form=train-player] input', 'Gast');
await p.click('[data-form=train-player] .btn');
await p.click('[data-testid=start-score]');
await p.click('[data-act=mod][data-arg="3"]'); await key(20); await key(20); await key(20); // T20 20 20 = 100
check((await p.locator('.celebrate.show .cel-small').textContent()) === '100+!', 'viering 100+! met score ' + (await p.locator('.celebrate.show .cel-big').textContent()));
check((await p.getByTestId('now-up').textContent()) === 'Gast', 'beurt gaat automatisch naar de volgende speler');
check((await p.locator('[data-testid=gp-0] strong').textContent()) === '100', 'score eerste speler 100');
await p.evaluate(() => navigator.serviceWorker.ready);
const cdp = await ctx.newCDPSession(p);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
const real = installabilityErrors.filter(x => x.errorId !== 'in-incognito');
check(real.length === 0, 'installeerbaar als app (Chrome-controle)' + (real.length ? ': ' + JSON.stringify(real) : ''));
const manifest = await p.evaluate(async () => (await (await fetch('manifest.webmanifest')).json()));
check(manifest.short_name === 'OKKIE.' && manifest.icons.length >= 3, 'manifest OKKIE. met iconen');
const icon = await p.evaluate(async () => (await fetch('icons/icon-192.png')).ok);
check(icon, 'app-icoon bereikbaar');
await p.reload();
await p.evaluate(() => navigator.serviceWorker.ready);
await ctx.setOffline(true);
await p.reload();
check((await p.getByTestId('live-total').textContent()) === '0' && (await p.getByTestId('now-up').textContent()) === 'Gast', 'offline: lopende training met 2 spelers hervat');
// De cache moet passen bij de serviceworker die op dít adres live staat (oud en nieuw adres kunnen even verschillen).
const liveCache = (await p.evaluate(async () => (await fetch('sw.js', { cache: 'no-store' })).text())).match(/const VERSION = '([^']+)'/)[1];
check((await p.evaluate(() => caches.keys())).includes(liveCache), 'offline-cache ' + liveCache);
check(!errors.length, 'geen JavaScript-fouten' + (errors.length ? ': ' + errors.join(' | ') : ''));
await b.close();
