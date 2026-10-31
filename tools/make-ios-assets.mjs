// App-icoon en startscherm voor de iPhone-app, uit hetzelfde merk als de PWA (js/brand.js).
// - AppIcon 1024 x 1024: vol vierkant (iOS rondt zelf af), zonder transparantie of alfakanaal (eis App Store).
// - Splash 2732 x 2732: donkere OKKIE.-achtergrond met het woordmerk in het midden; iOS snijdt de zijkanten af.
// Vereist Playwright en ImageMagick. Lokaal zonder Chrome: PW_EXECUTABLE=/pad/naar/chromium node tools/make-ios-assets.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { iconSVG, logoSVG, BRAND } from '../js/brand.js';

const assets = new URL('../ios/App/App/Assets.xcassets/', import.meta.url);
const path = rel => fileURLToPath(new URL(rel, assets));
const exe = process.env.PW_EXECUTABLE;
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: process.env.PW_CHANNEL || 'chrome' });
const page = await browser.newPage();
const opaque = file => execFileSync('convert', [file, '-background', BRAND.dark, '-alpha', 'remove', '-alpha', 'off', '-strip', 'PNG24:' + file]);

await page.setViewportSize({ width: 1024, height: 1024 });
await page.setContent(`<style>html,body{margin:0;background:${BRAND.dark}}</style>${iconSVG({ size: 1024, rounded: false })}`);
const icon = path('AppIcon.appiconset/AppIcon-512@2x.png');
await page.screenshot({ path: icon });
opaque(icon);

await page.setViewportSize({ width: 2732, height: 2732 });
await page.setContent(`<style>html,body{margin:0;width:2732px;height:2732px;background:${BRAND.dark};display:grid;place-items:center}
  body{background:radial-gradient(1300px 1300px at 50% 46%,#123d29 0%,${BRAND.dark} 70%)}</style>${logoSVG({ height: 230, file: true })}`);
const splash = path('Splash.imageset/splash-2732x2732.png');
await page.screenshot({ path: splash });
opaque(splash);
for (const n of ['splash-2732x2732-1.png', 'splash-2732x2732-2.png']) execFileSync('cp', [splash, path('Splash.imageset/' + n)]);
await browser.close();
console.log('iPhone-app: AppIcon en startscherm gemaakt in ios/App/App/Assets.xcassets/');
