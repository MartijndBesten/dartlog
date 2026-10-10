// Genereert de app-iconen (SVG + PNG) uit js/brand.js. Vereist Playwright (npm i).
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { iconSVG, logoSVG } from '../js/brand.js';

const out = new URL('../icons/', import.meta.url);
await writeFile(new URL('icon.svg', out), iconSVG());
await writeFile(new URL('logo.svg', out), logoSVG({ height: 100 }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('var(--logo-text, #f3eedf)', '#f3eedf'));

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
const page = await browser.newPage();
const shots = [
  ['icon-192.png', 192, { rounded: false }],
  ['icon-512.png', 512, { rounded: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { rounded: false }],
  ['favicon-32.png', 32, { rounded: true }],
];
for (const [name, size, opts] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${iconSVG({ size, ...opts })}`);
  await page.screenshot({ path: new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, '$1'), omitBackground: true });
}
await browser.close();
console.log('Iconen gemaakt in icons/');
