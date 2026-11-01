// Bouw de publieke website voor okkiedarts.nl (Cloudflare Pages).
// Uitvoer: dist/index.html (website), dist/dartregels/ (tekst en tekening uit js/rules.js, dezelfde als in de app),
// dist/privacy/, dist/contact/ en dist/uitleg/ (kinderuitleg).
// Bewust GEEN app op dit domein zelf: trainingen staan in de browseropslag van het app-adres, een kopie op
// okkiedarts.nl zou leeg beginnen. Alle app- en communitylinks gaan naar APP (sinds 1.3.5 app.okkiedarts.nl).
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rulesPage } from '../js/rules.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dest = join(root, 'dist');
const APP = 'https://app.okkiedarts.nl/';
rmSync(dest, {recursive: true, force:true});
mkdirSync(dest,{recursive:true});
// Merkbestanden uit icons/ komen op okkiedarts.nl in de root (/logo.svg, /og-image.jpg, ...).
// Het Denckh-signatuurlogo (met krul) is ongewijzigd overgenomen uit de Denckh-merkassets.
const BRAND_FILES = ['favicon.ico','favicon.svg','favicon-16.png','favicon-32.png','favicon-48.png','apple-touch-icon.png','icon-192.png','icon-512.png','logo.svg','okkie-o.svg','og-image.jpg','denckh-logo-signature-light.svg'];
for(const file of ['ontdek/pages-worker.js','ontdek/index.html','ontdek/privacy/index.html','ontdek/contact/index.html','ontdek/club/index.html','ontdek/club/uitnodiging/index.html','ontdek/dartregels/index.html','ontdek/site.css','ontdek/site.js','uitleg/index.html',...BRAND_FILES.map(f=>'icons/'+f)]) {
  if(!existsSync(join(root,file))) throw new Error('Ontbrekend bestand: '+file);
}
for(const f of BRAND_FILES) cpSync(join(root,'icons',f),join(dest,f));
// In de repo staan de pagina's onder ontdek/ en verwijzen ze naar ../icons/ of ../../icons/; op de site naar /.
const rootIcons = html => html.replace(/(?:\.\.\/)+icons\//g,'/');
let landing = readFileSync(join(root,'ontdek','index.html'),'utf8');
landing = rootIcons(landing)
  .replaceAll('href="../community/"','href="'+APP+'community/"')
  .replaceAll('href="../uitleg/"','href="/uitleg/"')
  .replaceAll('href="../"','href="'+APP+'"')
  .replaceAll('href="./site.css"','href="/site.css"')
  .replaceAll('src="./site.js"','src="/site.js"')
  .replaceAll('href="./privacy/"','href="/privacy/"')
  .replaceAll('href="./contact/"','href="/contact/"')
  .replaceAll('href="./dartregels/"','href="/dartregels/"')
  .replaceAll('href="./club/"','href="/club/"')
  .replaceAll('href="./"','href="/"');
writeFileSync(join(dest,'index.html'),landing);
cpSync(join(root,'ontdek','site.css'),join(dest,'site.css'));
cpSync(join(root,'ontdek','site.js'),join(dest,'site.js'));
// Dartregels, privacy en contact: in de repo relatief onder ontdek/, op okkiedarts.nl vanaf de root.
// Dartregels krijgt de tekst en tekening van de app (js/rules.js), zodat website en app nooit uit elkaar lopen.
for(const page of ['dartregels','privacy','contact','club']) {
  mkdirSync(join(dest,page),{recursive:true});
  writeFileSync(join(dest,page,'index.html'),rootIcons(readFileSync(join(root,'ontdek',page,'index.html'),'utf8'))
    .replaceAll('<!--RULES-->',page==='dartregels'?rulesPage():'')
    .replaceAll('href="../dartregels/"','href="/dartregels/"')
    .replaceAll('href="../site.css"','href="/site.css"')
    .replaceAll('src="../site.js"','src="/site.js"')
    .replaceAll('href="../privacy/"','href="/privacy/"')
    .replaceAll('href="../privacy/#','href="/privacy/#')
    .replaceAll('href="../contact/"','href="/contact/"')
    .replaceAll('href="../club/"','href="/club/"')
    .replaceAll('href="../"','href="/"'));
}
// OKKIE. Club (pagina voor verenigingen): schermafbeeldingen met fictieve gegevens.
for(const f of readdirSync(join(root,'ontdek','club')).filter(f=>f.endsWith('.webp'))) cpSync(join(root,'ontdek','club',f),join(dest,'club',f));
// Landingspagina voor uitnodigingslinks (okkiedarts.nl/club/uitnodiging/#club=CODE): één niveau dieper, eigen paden.
mkdirSync(join(dest,'club','uitnodiging'),{recursive:true});
writeFileSync(join(dest,'club','uitnodiging','index.html'),rootIcons(readFileSync(join(root,'ontdek','club','uitnodiging','index.html'),'utf8'))
  .replaceAll('href="../../site.css"','href="/site.css"')
  .replaceAll('href="../../privacy/#club"','href="/privacy/#club"')
  .replaceAll('href="../../privacy/"','href="/privacy/"')
  .replaceAll('href="../../contact/"','href="/contact/"')
  .replaceAll('href="../../dartregels/"','href="/dartregels/"')
  .replaceAll('href="../../"','href="/"')
  .replaceAll('href="../"','href="/club/"'));
// De les is een zelfstandige pagina: geen gebruikersgegevens en geen tweede PWA.
cpSync(join(root,'uitleg'),join(dest,'uitleg'),{recursive:true});
const tutorialFile = join(dest,'uitleg','index.html');
writeFileSync(tutorialFile,rootIcons(readFileSync(tutorialFile,'utf8')));

// Cookieloze bezoekersteller van het Denckh-marketingdashboard (Worker dd-marketing via https://dashboard.denckh.nl, repo marketing-dashboard).
// Alleen op de website okkiedarts.nl: daarom hier in de build en niet in de bronpagina's. uitleg/ hoort ook bij
// de app (tools/build-app-site.mjs); die en de rest van de app krijgen de teller dus nooit.
// Stuurt alleen pad (zonder querystring), herkomsthost en utm_source; geen cookies, geen persoonsgegevens.
const COUNTER = '<script defer src="https://dashboard.denckh.nl/s.js" data-brand="okkie"></script>';
for(const page of ['index.html','dartregels/index.html','privacy/index.html','contact/index.html','club/index.html','club/uitnodiging/index.html','uitleg/index.html']) {
  const file = join(dest,page), html = readFileSync(file,'utf8');
  if(!html.includes('</head>')) throw new Error('Geen </head> in '+page);
  writeFileSync(file,html.replace('</head>','  '+COUNTER+'\n</head>'));
}

// Google Search Console: verificatiebestand van het account m.denbesten@live.nl (ook gebruikt voor denckh.nl).
writeFileSync(join(dest,'google873828225866c738.html'),'google-site-verification: google873828225866c738.html');
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
<url><loc>https://okkiedarts.nl/dartregels/</loc></url>
<url><loc>https://okkiedarts.nl/privacy/</loc></url>
<url><loc>https://okkiedarts.nl/contact/</loc></url>
<url><loc>https://okkiedarts.nl/club/</loc></url>
</urlset>
`);
console.log('OKKIE. publieke site opgebouwd in dist/. Publicatie is NIET uitgevoerd.');
