// Controleert de lengtes in appstore/APPSTORE-TEKSTEN.md tegen de grenzen van App Store Connect.
import { readFileSync } from 'node:fs';
const md = readFileSync(new URL('../../appstore/APPSTORE-TEKSTEN.md', import.meta.url), 'utf8');
const block = title => (md.split('## ' + title)[1] || '').match(/```\n([\s\S]*?)\n```/)?.[1] ?? null;
const cell = label => (md.match(new RegExp('\\| ' + label + '[^|]*\\| `([^`]+)`')) || [])[1] ?? null;
export const checks = [
  ['Naam', cell('Naam'), 30], ['Ondertitel', cell('Ondertitel'), 30],
  ['Promotietekst', block('Promotietekst'), 170], ['Beschrijving', block('Beschrijving'), 4000],
  ['Trefwoorden', block('Trefwoorden'), 100], ['Wat is nieuw', block('Wat is nieuw'), 4000],
].map(([n, v, max]) => ({ n, len: v == null ? -1 : [...v].length, max }));
let bad = 0;
for (const c of checks) { const ok = c.len > 0 && c.len <= c.max; if (!ok) bad++; console.log(`${ok ? 'ok ' : 'FOUT'} ${c.n}: ${c.len}/${c.max}`); }
if (bad) process.exit(1);
