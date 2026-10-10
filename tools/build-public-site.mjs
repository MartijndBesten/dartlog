// Bouw een publiceerbare Cloudflare Pages-site zonder de huidige GitHub Pages-app te verplaatsen.
// Uitvoer: dist/index.html (website), dist/app/ (PWA + community).
import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dest = join(root, 'dist');
rmSync(dest, {recursive: true, force:true});
mkdirSync(join(dest,'app'),{recursive:true});
for(const file of ['index.html','manifest.webmanifest','sw.js']) {
  if(!existsSync(join(root,file))) throw new Error('Ontbrekend PWA-bestand: '+file);
  cpSync(join(root,file),join(dest,'app',file));
}
for(const folder of ['css','js','icons','community']) {
  cpSync(join(root,folder),join(dest,'app',folder),{recursive:true});
}
let landing = readFileSync(join(root,'ontdek','index.html'),'utf8');
landing = landing
  .replaceAll('href="../icons/favicon-32.png"','href="/app/icons/favicon-32.png"')
  .replaceAll('href="../community/"','href="/app/community/"')
  .replaceAll('href="../"','href="/app/"')
  .replaceAll('href="./site.css"','href="/site.css"')
  .replaceAll('href="./"','href="/"');
writeFileSync(join(dest,'index.html'),landing);
cpSync(join(root,'ontdek','site.css'),join(dest,'site.css'));
writeFileSync(join(dest,'_headers'),\`/*
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/app/*
  Service-Worker-Allowed: /app/
\`);
writeFileSync(join(dest,'robots.txt'),\`User-agent: *
Allow: /
Disallow: /beheer/
Sitemap: https://okkiedarts.nl/sitemap.xml
\`);
writeFileSync(join(dest,'sitemap.xml'),\`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://okkiedarts.nl/</loc></url>
<url><loc>https://okkiedarts.nl/app/</loc></url>
<url><loc>https://okkiedarts.nl/app/community/</loc></url>
</urlset>
\`);
console.log('OKKIE. publieke site opgebouwd in dist/. Publicatie is NIET uitgevoerd.');
