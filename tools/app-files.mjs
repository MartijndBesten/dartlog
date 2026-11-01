// Welke bestanden samen "de app" zijn. Gedeeld door tools/build-app-site.mjs (app.okkiedarts.nl) en
// tools/build-ios-web.mjs (de iPhone-app), zodat beide precies dezelfde app krijgen.
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Alles wat de app nodig heeft. Geen cloud/, tests/, tools/, ontdek/ of documentatie.
export const PARTS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'uitleg', 'community', 'vrienden', 'club'];
export const REQUIRED = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'uitleg'];

export function copyApp(root, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const part of PARTS) {
    const from = join(root, part);
    if (!existsSync(from)) { if (REQUIRED.includes(part)) throw new Error('Ontbrekend: ' + part); continue; }
    cpSync(from, join(dest, part), { recursive: true });
  }
  // Community (en in 1.4.0 Mijn vrienden) gebruiken de stijl van de website: alleen die stylesheet meenemen,
  // geen kopie van de website. "Over OKKIE." wijst naar okkiedarts.nl.
  mkdirSync(join(dest, 'ontdek'), { recursive: true });
  cpSync(join(root, 'ontdek', 'site.css'), join(dest, 'ontdek', 'site.css'));
  for (const page of ['community/index.html', 'vrienden/index.html', 'club/index.html']) {
    const file = join(dest, page);
    if (existsSync(file)) writeFileSync(file, readFileSync(file, 'utf8').replaceAll('href="../ontdek/"', 'href="https://okkiedarts.nl/"'));
  }
}

// Controle: elk bestand dat de serviceworker vooraf bewaart, moet bestaan.
export function swAssets(dest) {
  const sw = readFileSync(join(dest, 'sw.js'), 'utf8');
  const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const a of assets) {
    const file = a.endsWith('/') ? a + 'index.html' : a;
    if (!existsSync(join(dest, file))) throw new Error('Serviceworker verwacht ontbrekend bestand: ' + a);
  }
  return assets;
}
