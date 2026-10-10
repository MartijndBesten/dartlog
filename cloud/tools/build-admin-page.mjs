// Houd de beheer-HTML en de door de Worker geïmporteerde JS-template gelijk.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = new URL('../src/', import.meta.url);
const html = readFileSync(new URL('admin.html',dir),'utf8');
writeFileSync(new URL('admin-page.js',dir),'// Generated from cloud/src/admin.html; update via node cloud/tools/build-admin-page.mjs\nexport const adminHtml = '+JSON.stringify(html)+';\n');
console.log('Beheerpagina gebundeld.');
