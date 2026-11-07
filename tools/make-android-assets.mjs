// App-icoon en startscherm voor de Android-app, uit hetzelfde merk als de PWA en de iPhone-app (js/brand.js).
// - Klassiek icoon (ic_launcher, ic_launcher_round) per dichtheid; adaptief icoon: voorgrond (108 dp, logo binnen de
//   veilige zone van 66 dp) op de donkere OKKIE.-achtergrond (values/ic_launcher_background.xml).
// - Startscherm (splash.png per dichtheid, staand en liggend): donkere achtergrond met het woordmerk in het midden.
// Vereist Playwright en ImageMagick. Lokaal zonder Chrome: PW_EXECUTABLE=/pad/naar/chromium node tools/make-android-assets.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { iconSVG, logoSVG, BRAND } from '../js/brand.js';

const res = rel => fileURLToPath(new URL('../android/app/src/main/res/' + rel, import.meta.url));
const exe = process.env.PW_EXECUTABLE;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: process.env.PW_CHANNEL || 'chrome' });
const page = await browser.newPage();
const opaque = file => execFileSync('convert', [file, '-background', BRAND.dark, '-alpha', 'remove', '-alpha', 'off', '-strip', 'PNG24:' + file]);
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, f] of Object.entries(DENS)) {
  // Klassiek: 48 dp, afgeronde tegel; rond: cirkel.
  const px = Math.round(48 * f);
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${iconSVG({ size: px, rounded: true, small: px <= 72 })}`);
  await page.screenshot({ path: res(`mipmap-${d}/ic_launcher.png`), omitBackground: true });
  await page.setContent(`<style>html,body{margin:0;background:transparent}div{width:${px}px;height:${px}px;border-radius:50%;overflow:hidden}</style><div>${iconSVG({ size: px, rounded: false, small: px <= 72 })}</div>`);
  await page.screenshot({ path: res(`mipmap-${d}/ic_launcher_round.png`), omitBackground: true });
  // Adaptief: voorgrond 108 dp op de OKKIE.-achtergrond.
  const fg = Math.round(108 * f);
  await page.setViewportSize({ width: fg, height: fg });
  // Android kan tot 66 van de 108 dp tonen (cirkel): het hele logo, ook de pijl, kleiner in het midden op de achtergrond.
  const inner = Math.round(fg * 0.74);
  await page.setContent(`<style>html,body{margin:0;width:${fg}px;height:${fg}px;background:${BRAND.dark};display:grid;place-items:center}</style>${iconSVG({ size: inner, rounded: false })}`);
  await page.screenshot({ path: res(`mipmap-${d}/ic_launcher_foreground.png`), omitBackground: true });
}
writeFileSync(res('values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND.dark}</color>\n</resources>\n`);

// Startschermen (zelfde formaten als de Capacitor-sjabloon).
const SPLASH = { '': [480, 800], 'port-mdpi': [320, 480], 'port-hdpi': [480, 800], 'port-xhdpi': [720, 1280], 'port-xxhdpi': [960, 1600], 'port-xxxhdpi': [1280, 1920],
  'land-mdpi': [480, 320], 'land-hdpi': [800, 480], 'land-xhdpi': [1280, 720], 'land-xxhdpi': [1600, 960], 'land-xxxhdpi': [1920, 1280] };
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  await page.setViewportSize({ width: w, height: h });
  const logo = Math.round(Math.min(w, h) * 0.14);
  await page.setContent(`<style>html,body{margin:0;width:${w}px;height:${h}px;background:${BRAND.dark};display:grid;place-items:center}
    body{background:radial-gradient(${Math.max(w, h) * 0.6}px ${Math.max(w, h) * 0.6}px at 50% 46%,#123d29 0%,${BRAND.dark} 70%)}</style>${logoSVG({ height: logo, file: true })}`);
  const file = res(`drawable${d ? '-' + d : ''}/splash.png`);
  await page.screenshot({ path: file });
  opaque(file);
}
await browser.close();
console.log('Android-app: iconen (klassiek, rond, adaptief) en startschermen gemaakt in android/app/src/main/res/');
