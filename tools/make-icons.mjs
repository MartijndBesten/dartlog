// Genereert alle merkbestanden uit js/brand.js: O, woordmerk, app-iconen, favicons en de deelafbeelding.
// Vereist Playwright (npm ci). Lokaal zonder Chrome: PW_EXECUTABLE=/pad/naar/chromium npm run icons
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { iconSVG, logoSVG, markSVG, TAGLINE } from '../js/brand.js';

const out = new URL('../icons/', import.meta.url);
const path = name => fileURLToPath(new URL(name, out));
await writeFile(path('icon.svg'), iconSVG());
await writeFile(path('favicon.svg'), iconSVG({ small: true }));
await writeFile(path('okkie-o.svg'), markSVG() + '\n');
await writeFile(path('logo.svg'), logoSVG({ height: 100, file: true }) + '\n');

const exe = process.env.PW_EXECUTABLE;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: process.env.PW_CHANNEL || 'chrome' });
const page = await browser.newPage();
// [bestand, px, opties]. apple-touch-icon moet vol en ondoorzichtig zijn (iOS rondt zelf af).
const shots = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { rounded: false }],
  ['favicon-48.png', 48, { small: true }],
  ['favicon-32.png', 32, { small: true }],
  ['favicon-16.png', 16, { small: true }],
];
for (const [name, size, opts] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${iconSVG({ size, ...opts })}`);
  await page.screenshot({ path: path(name), omitBackground: true });
}

// Deelafbeelding voor WhatsApp, Facebook en X (1200 x 630). Belangrijkste inhoud in het midden,
// zodat ook een vierkante uitsnede (kleine voorvertoning) herkenbaar blijft.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><html><head><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{background:radial-gradient(900px 520px at 50% 0%,#174f33 0%,#0b2418 55%,#07120d 100%);display:grid;place-items:center;font-family:'Inter','Inter Display',system-ui,sans-serif;color:#f3eedf}
  .wrap{display:grid;justify-items:center;gap:26px;text-align:center}
  .tag{font-weight:900;font-style:italic;letter-spacing:.06em;text-transform:uppercase;color:#b8ff3c;font-size:36px}
  .sub{font-size:28px;font-weight:600;color:#a7bdaf}
  .ring{position:absolute;border-radius:50%;border:2px solid #b8ff3c22}
</style></head><body>
  <div class="ring" style="width:1100px;height:1100px;left:50px;top:-235px"></div>
  <div class="ring" style="width:760px;height:760px;left:220px;top:-65px"></div>
  <div class="wrap">${logoSVG({ height: 148, file: true })}<div class="tag">${TAGLINE}</div><div class="sub">Gratis darttrainer voor jong en oud</div></div>
</body></html>`);
await page.screenshot({ path: path('og-image.png') });
execFileSync('convert', [path('og-image.png'), '-strip', '-quality', '88', '-sampling-factor', '4:2:0', path('og-image.jpg')]);
await import('node:fs/promises').then(fs => fs.rm(path('og-image.png')));
await browser.close();

// favicon.ico (16/32/48) voor browsers en zoekmachines die /favicon.ico opvragen.
try {
  execFileSync('convert', [path('favicon-16.png'), path('favicon-32.png'), path('favicon-48.png'), path('favicon.ico')]);
} catch { console.warn('ImageMagick (convert) ontbreekt: favicon.ico niet bijgewerkt.'); }
console.log('Merkbestanden gemaakt in icons/');
