// Bouw de dartapp voor het nieuwe adres app.okkiedarts.nl (aparte GitHub Pages-repository, zie VERHUIZING.md).
// Uitvoer: dist-app/ met precies de app (zelfde bestanden als op het oude adres) plus CNAME.
//
// BELANGRIJK: zet NOOIT een eigen domein op de repository MartijndBesten/dartlog zelf. GitHub stuurt het
// oude adres martijndbesten.github.io/dartlog/ dan automatisch door, en bestaande spelers kunnen hun
// opgeslagen trainingen (die bij het oude adres horen) niet meer openen om ze over te zetten.
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dest = join(root, 'dist-app');
export const APP_DOMAIN = 'app.okkiedarts.nl';
// Alles wat de app nodig heeft. Geen cloud/, tests/, tools/, ontdek/ of documentatie.
const PARTS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'uitleg', 'community', 'vrienden'];
const REQUIRED = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'uitleg'];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const part of PARTS) {
  const from = join(root, part);
  if (!existsSync(from)) { if (REQUIRED.includes(part)) throw new Error('Ontbrekend: ' + part); continue; }
  cpSync(from, join(dest, part), { recursive: true });
}
// Community (en in 1.4.0 Mijn vrienden) gebruiken de stijl van de website: alleen die stylesheet meenemen,
// geen kopie van de website. "Over OKKIE." wijst op het nieuwe adres naar okkiedarts.nl.
mkdirSync(join(dest, 'ontdek'), { recursive: true });
cpSync(join(root, 'ontdek', 'site.css'), join(dest, 'ontdek', 'site.css'));
for (const page of ['community/index.html', 'vrienden/index.html']) {
  const file = join(dest, page);
  if (existsSync(file)) writeFileSync(file, readFileSync(file, 'utf8').replaceAll('href="../ontdek/"', 'href="https://okkiedarts.nl/"'));
}
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
// Controle: elk bestand dat de serviceworker vooraf bewaart, moet bestaan.
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
for (const a of assets) {
  const file = a.endsWith('/') ? a + 'index.html' : a;
  if (!existsSync(join(dest, file))) throw new Error('Serviceworker verwacht ontbrekend bestand: ' + a);
}
writeFileSync(join(dest, 'CNAME'), APP_DOMAIN + '\n');
writeFileSync(join(dest, '.nojekyll'), '');
writeFileSync(join(dest, 'README.md'), `# ${APP_DOMAIN}\n\nDe OKKIE.-dartapp op het nieuwe adres. Gegenereerd uit MartijndBesten/dartlog met \`node tools/build-app-site.mjs\`.\nNiet hier met de hand wijzigen. Zie VERHUIZING.md in dartlog.\n`);
console.log(`OKKIE.-app voor ${APP_DOMAIN} opgebouwd in dist-app/. Publicatie is NIET uitgevoerd.`);
