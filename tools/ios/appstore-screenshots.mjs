// App Store-screenshots (iPhone 6,9": 1320 x 2868) van de echte app met een fictieve speler.
// Starten met de lokale server aan (npm start) of laat dit script hem zelf starten:
//   PW_EXECUTABLE=/pad/naar/chromium node tools/ios/appstore-screenshots.mjs
// Uitvoer: appstore/screenshots/6.9/*.png. Veilige ruimte boven (Dynamic Island) en onder (thuisbalk) nagebootst.
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { demoData } from './appstore-demo-data.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = fileURLToPath(new URL('../../appstore/screenshots/6.9/', import.meta.url));
mkdirSync(out, { recursive: true });
const PORT = 4179, BASE = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { cwd: root, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

// Fictieve speler Sem (tools/ios/appstore-demo-data.mjs), dezelfde als in de simulator-screenshots.
const data = demoData();

const exe = process.env.PW_EXECUTABLE;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: process.env.PW_CHANNEL || 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
await ctx.addInitScript(d => {
  if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d));
  localStorage.setItem('okkie.install.v1', JSON.stringify({ offeredAt: '2026-09-04T18:00:00.000Z', installedAt: '2026-09-04T18:00:00.000Z' }));
  localStorage.setItem('okkie.backup.last-count.sem', '46');
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    // iPhone 17 Pro Max: 62 px boven (Dynamic Island), 34 px thuisbalk onder.
    s.textContent = ':root{--sat-min:62px} .tabbar{padding-bottom:38px!important} .page{padding-bottom:140px!important} .play{padding-bottom:34px!important} .toast{display:none!important}';
    document.head.append(s);
  });
}, data);
const page = await ctx.newPage();
const tap = async sel => { await page.click(sel); await page.waitForTimeout(250); };
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: out + name + '.png' }); console.log('  ' + name); };
const key = async code => {
  const m = code[0], n = code.slice(1);
  if (m === 'D') await tap('[data-act=mod][data-arg="2"]');
  if (m === 'T') await tap('[data-act=mod][data-arg="3"]');
  await page.click(`.nums [data-act=key][data-arg="${n}"]`); await page.waitForTimeout(120);
};

await page.goto(BASE);
await shot('1-home');
await tap('.action.train');
await tap('[data-testid=start-score]');
for (const c of ['T20', 'S20', 'S5', 'S20', 'T20', 'S1', 'T20', 'T19']) await key(c);
await shot('2-training');
for (let i = 0; i < 22; i++) await key(['T20', 'S20', 'S20'][i % 3]);
await page.waitForSelector('.result-hero');
await shot('3-uitslag');
await page.goto(BASE);
await tap('.tabbar [data-go=stats]');
await shot('4-statistieken');
await page.evaluate(() => document.querySelector('.board, svg.board, [data-testid=heatmap]')?.scrollIntoView({ block: 'center' }));
await shot('5-trefferkaart');
await tap('.tabbar [data-go=match]');
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Start|wedstrijd/i.test(b.textContent) && b.classList.contains('primary'))?.click());
await page.waitForTimeout(500);
for (const c of ['T20', 'T20', 'T20', 'S20', 'S20', 'S20', 'T20', 'T19', 'S18']) if (await page.locator('.nums').count()) await key(c);
await shot('6-wedstrijd-501');
await browser.close();
server.kill();
console.log('Screenshots in appstore/screenshots/6.9/ (1320 x 2868).');
