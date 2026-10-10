// Bouw de publieke website voor okkiedarts.nl (Cloudflare Pages).
// Uitvoer: dist/index.html (website) en dist/uitleg/ (kinderuitleg).
// Bewust GEEN tweede app op dit domein: trainingen staan in localStorage van de GitHub Pages-origin,
// een kopie op okkiedarts.nl zou leeg beginnen. Alle app- en communitylinks gaan daarom naar APP.
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dest = join(root, 'dist');
const APP = 'https://martijndbesten.github.io/dartlog/';
rmSync(dest, {recursive: true, force:true});
mkdirSync(dest,{recursive:true});
for(const file of ['ontdek/index.html','ontdek/site.css','ontdek/site.js','uitleg/index.html','icons/favicon-32.png']) {
  if(!existsSync(join(root,file))) throw new Error('Ontbrekend bestand: '+file);
}
cpSync(join(root,'icons','favicon-32.png'),join(dest,'favicon-32.png'));
let landing = readFileSync(join(root,'ontdek','index.html'),'utf8');
landing = landing
  .replaceAll('href="../icons/favicon-32.png"','href="/favicon-32.png"')
  .replaceAll('href="../community/"','href="'+APP+'community/"')
  .replaceAll('href="../uitleg/"','href="/uitleg/"')
  .replaceAll('href="../"','href="'+APP+'"')
  .replaceAll('href="./site.css"','href="/site.css"')
  .replaceAll('src="./site.js"','src="/site.js"')
  .replaceAll('href="./"','href="/"');
writeFileSync(join(dest,'index.html'),landing);
cpSync(join(root,'ontdek','site.css'),join(dest,'site.css'));
cpSync(join(root,'ontdek','site.js'),join(dest,'site.js'));
// De les is een zelfstandige pagina: geen gebruikersgegevens en geen tweede PWA.
cpSync(join(root,'uitleg'),join(dest,'uitleg'),{recursive:true});
const tutorialFile = join(dest,'uitleg','index.html');
writeFileSync(tutorialFile,readFileSync(tutorialFile,'utf8')
  .replace('href="../icons/favicon-32.png"','href="/favicon-32.png"'));

writeFileSync(join(dest,'_headers'),`/*
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`);
writeFileSync(join(dest,'robots.txt'),`User-agent: *
Allow: /
Sitemap: https://okkiedarts.nl/sitemap.xml
`);
writeFileSync(join(dest,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://okkiedarts.nl/</loc></url>
<url><loc>https://okkiedarts.nl/uitleg/</loc></url>
</urlset>
`);
console.log('OKKIE. publieke site opgebouwd in dist/. Publicatie is NIET uitgevoerd.');
