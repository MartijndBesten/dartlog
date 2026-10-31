// App Store-screenshots (iPhone 6,9": 1320 x 2868) van de echte app met een fictieve speler.
// Starten met de lokale server aan (npm start) of laat dit script hem zelf starten:
//   PW_EXECUTABLE=/pad/naar/chromium node tools/ios/appstore-screenshots.mjs
// Uitvoer: appstore/screenshots/6.9/*.png. Veilige ruimte boven (Dynamic Island) en onder (thuisbalk) nagebootst.
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = fileURLToPath(new URL('../../appstore/screenshots/6.9/', import.meta.url));
mkdirSync(out, { recursive: true });
const PORT = 4179, BASE = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT)], { cwd: root, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

// Fictieve speler Sem: acht weken trainen, langzaam beter (vaste willekeur, dus elke keer dezelfde plaatjes).
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function dart(level) {
  const r = rnd();
  const n = rnd() < 0.55 + level * 0.25 ? 20 : [1, 5, 19, 3, 18, 12][Math.floor(rnd() * 6)];
  if (r < 0.04 + level * 0.1) return 'T' + n;
  if (r < 0.07 + level * 0.06) return 'D' + n;
  if (r > 0.985) return 'M';
  return 'S' + n;
}
const day = 864e5, start = Date.parse('2026-09-04T18:30:00Z');
const trainings = [];
for (let i = 0; i < 46; i++) {
  const t0 = start + Math.floor(i * 1.25) * day + (i % 3) * 3600e3;
  const level = Math.min(1, i / 52);
  const turns = Array.from({ length: i % 4 === 3 ? 20 : 10 }, (_, k) => ({ at: new Date(t0 + k * 40e3).toISOString(), darts: [dart(level), dart(level), dart(level)] }));
  if (i === 41) turns[4].darts = ['T20', 'T20', 'T20'];
  trainings.push({ id: 'demo-' + i, playerId: 'sem', kind: 'score', limitTurns: turns.length, startedAt: new Date(t0).toISOString(), finishedAt: new Date(t0 + turns.length * 40e3).toISOString(), turns });
}
const data = { version: 2, activePlayerId: 'sem', players: [
  { id: 'sem', name: 'Sem', color: '#3ddc84', createdAt: '2026-09-04T18:00:00.000Z' },
  { id: 'papa', name: 'Papa', color: '#ff5a5f', createdAt: '2026-09-04T18:00:00.000Z' }],
  trainings, matches: [], settings: { theme: 'dark', sound: false, vibrate: false, speech: true }, active: { training: null, match: null } };

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
