// Bouw de dartapp voor het nieuwe adres app.okkiedarts.nl (aparte GitHub Pages-repository, zie VERHUIZING.md).
// Uitvoer: dist-app/ met precies de app (zelfde bestanden als op het oude adres) plus CNAME.
//
// BELANGRIJK: zet NOOIT een eigen domein op de repository MartijndBesten/dartlog zelf. GitHub stuurt het
// oude adres martijndbesten.github.io/dartlog/ dan automatisch door, en bestaande spelers kunnen hun
// opgeslagen trainingen (die bij het oude adres horen) niet meer openen om ze over te zetten.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyApp, swAssets } from './app-files.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dest = join(root, 'dist-app');
export const APP_DOMAIN = 'app.okkiedarts.nl';
copyApp(root, dest);
swAssets(dest);
// Testfase (OKKIE_APP_STAGE=test): niet in zoekmachines, zolang de verhuizing niet is aangekondigd en de
// app nog niet op echte toestellen is getest. Verder byte-gelijk aan de app op het oude adres.
const STAGE = process.env.OKKIE_APP_STAGE || 'live';
if (STAGE === 'test') {
  const index = join(dest, 'index.html');
  writeFileSync(index, readFileSync(index, 'utf8').replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="robots" content="noindex, nofollow">'));
  writeFileSync(join(dest, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
}
// Cookieloze bezoekersteller van het Denckh-marketingdashboard (besluit Martijn, 16 november 2026): alleen in de
// webapp op app.okkiedarts.nl en alleen in index.html (de app zelf). Daarom hier in de build en niet in de bron:
// de iPhone- en Android-app (tools/build-ios-web.mjs) en het oude adres krijgen hem zo nooit, en ook uitleg/,
// community/, vrienden/ en club/ (beheer, poster, persoonlijke links) niet. data-brand moet exact "okkie" zijn
// (project-id in marketing-dashboard/data/projecten.json). De app wisselt schermen zonder het adres te veranderen,
// dus er wordt alleen het openen van de app geteld. Niet in de testfase.
const COUNTER = '<script defer src="https://dashboard.denckh.nl/s.js" data-brand="okkie"></script>';
if (STAGE !== 'test') {
  const index = join(dest, 'index.html'), html = readFileSync(index, 'utf8');
  if (html.split('</head>').length !== 2 || html.includes('dashboard.denckh.nl/s.js')) throw new Error('index.html: geen eenduidige </head> of teller staat er al');
  writeFileSync(index, html.replace('</head>', '  ' + COUNTER + '\n</head>'));
}
writeFileSync(join(dest, 'CNAME'), APP_DOMAIN + '\n');
writeFileSync(join(dest, '.nojekyll'), '');
writeFileSync(join(dest, 'README.md'), `# ${APP_DOMAIN}\n\nDe OKKIE.-dartapp op het nieuwe adres. Gegenereerd uit MartijndBesten/dartlog met \`node tools/build-app-site.mjs\`.\nNiet hier met de hand wijzigen. Zie VERHUIZING.md in dartlog.\n`);
console.log(`OKKIE.-app voor ${APP_DOMAIN} (${STAGE === 'test' ? 'testfase, niet vindbaar' : 'live'}) opgebouwd in dist-app/. Publicatie is NIET uitgevoerd.`);
