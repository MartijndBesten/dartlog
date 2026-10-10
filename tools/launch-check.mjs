// Juridische en inhoudelijke controle vlak vóór publicatie van okkiedarts.nl.
// Gebruik: npm run check:launch  (bouwt dist/ en faalt zolang er verplichte gegevens open staan)
// Dit is bewust GEEN onderdeel van de gewone CI: open velden zijn een bewuste, tijdelijke stand.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Velden die nog bevestigd moeten worden: <span data-pending="kvk">…</span>
export function pendingFields(html) {
  return [...html.matchAll(/data-pending="([^"]+)"/g)].map(m => m[1]);
}

function htmlFiles(dir) {
  return readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('.html')).map(f => f.replaceAll('\\', '/'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  execFileSync(process.execPath, [join(root, 'tools/build-public-site.mjs')], { stdio: 'inherit' });
  const dist = join(root, 'dist');
  const problems = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(join(dist, file), 'utf8');
    for (const field of pendingFields(html)) problems.push(`${file}: "${field}" is nog niet ingevuld`);
    if (/\[IN TE VULLEN/i.test(html)) problems.push(`${file}: bevat [IN TE VULLEN]`);
  }
  for (const page of ['privacy/index.html', 'contact/index.html']) {
    if (!htmlFiles(dist).includes(page)) problems.push(`ontbreekt: ${page}`);
  }
  // Registratie hoort bij de eerste lancering dicht te blijven.
  const toml = readFileSync(join(root, 'cloud/wrangler.toml'), 'utf8');
  if (/REGISTRATION_ENABLED = "true"/.test(toml)) problems.push('wrangler.toml: registratie staat open');
  if (/REGISTRATION_OPEN = true/.test(readFileSync(join(root, 'community/config.js'), 'utf8'))) problems.push('community/config.js: registratie staat open');

  if (problems.length) {
    console.log('\nNIET klaar voor publicatie:\n- ' + problems.join('\n- '));
    process.exitCode = 1;
  } else {
    console.log('\nGeen open velden; registratie dicht. Technisch klaar voor publicatie na akkoord.');
    console.log('Let op: dit is geen volledige juridische toets (zie DEPLOY-STRATO-CLOUDFLARE.md, juridische aandachtspunten).');
  }
}
