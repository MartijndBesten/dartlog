// Webbestanden voor de iPhone-app (Capacitor, zie IOS-APP.md): precies dezelfde app als app.okkiedarts.nl,
// lokaal in de app gebundeld zodat trainen en wedstrijden zonder internet werken.
// Uitvoer: dist-ios/ (webDir in capacitor.config.json). Daarna: npx cap sync ios.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyApp, swAssets } from './app-files.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dest = join(root, 'dist-ios');
copyApp(root, dest);
const assets = swAssets(dest);   // zelfde controle: alles wat offline nodig is, zit erin
writeFileSync(join(dest, 'README.txt'), 'Gegenereerd door tools/build-ios-web.mjs uit MartijndBesten/dartlog. Niet met de hand wijzigen.\n');
console.log(`iPhone-app: ${assets.length} offline bestanden gecontroleerd, opgebouwd in dist-ios/.`);
