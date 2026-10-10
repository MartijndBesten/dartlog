# OKKIE. — STRATO + Cloudflare: oplever- en publicatieplan

**Domein:** okkiedarts.nl, bij STRATO. Registratie ≠ hosting.
**Broncode:** GitHub MartijndBesten/dartlog.
**Release:** branch `release/okkie-1.3-live` (versie 1.3.1). Nog niet op main, nog niet gepubliceerd.
**Bestaande PWA:** https://martijndbesten.github.io/dartlog/ blijft bestaan.

## Stand release 1.3.1

Klaar en getest in GitHub Actions (workflows *OKKIE release checks* en *OKKIE community checks*):
- Browsertests op iPhone-, Android- en desktopformaat: app, offline, kinderuitleg, community zonder API,
  en de gebouwde website (`dist/`): animaties, tikken/Enter, verminderde beweging, zonder JavaScript,
  links, kleine telefoon (320 px), geen app-kopie.
- Echte update vanaf de live versie (`origin/main`, 1.3.0) naar 1.3.1: spelers, afgeronde training,
  lopende training met open pijl, statistieken, cachewissel en daarna offline (app én uitleg).
- API-integratietests (node:sqlite) en Worker-bundel (staging + productie, dry run).

**Registratie is dicht, op twee plaatsen:**
- Worker: `REGISTRATION_ENABLED = "false"` in `wrangler.toml` (staging én productie). Alleen exact `"true"` opent;
  dat gebeurt pas na privacyverklaring en ouderlijke toestemming (<16). Ook met Turnstile blijft hij dicht.
- App: `REGISTRATION_OPEN = false` in `community/config.js` verbergt het formulier. De ranglijst werkt wel.

**Beheer is dicht zonder volledige Access-configuratie:** zonder `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` of
`ADMIN_ALLOWED_EMAILS` bestaan `/beheer` en `/v1/admin/*` niet (404), ook niet met een geldig JWT.

### Blokkades vóór publicatie van okkiedarts.nl

Contact (`ontdek/contact/` → okkiedarts.nl/contact/) en privacyverklaring (`ontdek/privacy/` → okkiedarts.nl/privacy/)
staan klaar, onder de bedrijfsidentiteit van Denckh. (eenmanszaak, info@denckh.nl, link naar denckh.nl). Elke pagina
(homepage, uitleg, privacy, contact) toont "Ontwikkeld door Denckh." met links naar privacy en contact.

Open velden zijn gemarkeerd met `<span class="pending" data-pending="…">wordt aangevuld</span>`.
**`npm run check:launch` faalt zolang er één open staat; publiceer pas als hij slaagt.**

| Open veld | Waar | Toelichting |
|---|---|---|
| ~~`kvk`~~ | contact, privacy | Ingevuld: 83176896 (zelfde eenmanszaak als deegh.nl en denckh.nl) |
| ~~`btw`~~ | contact | Ingevuld: NL003791952B15 (btw-id, níet het omzetbelastingnummer) |
| `adres` | — | Definitieve keuze van de eigenaar: geen fysiek adres op website, repo, configuratie of metadata. Niet opnieuw vragen. |
| ~~`ingangsdatum`~~ | privacy | Ingevuld: 10 oktober 2026 |

Geen telefoonnummer: niet verplicht naast een e-mailadres. Een unittest bewaakt dat er geen telefoonnummer, postcode of
ander e-mailadres dan info@denckh.nl op de site komt; pas die alleen aan na uitdrukkelijke toestemming.
Bewaartermijn van contactmails staat op twaalf maanden na afhandeling (voorstel; pas aan in `ontdek/privacy/index.html`).

#### Juridische aandachtspunten (intern; geen volledige juridische toets)
- **Geen geografisch adres.** Art. 3:15d BW vraagt bij een dienst van de informatiemaatschappij om een geografisch adres.
  De eigenaar heeft bewust gekozen om géén fysiek adres te publiceren; er staat ook geen fictief adres. Risico is
  geaccepteerd door de eigenaar. Mogelijke oplossing later: een zakelijk post- of correspondentieadres.
- **Handelsnaam.** Controleer of "Denckh." als handelsnaam bij KvK 83176896 staat (Deegh staat er zeker op).
- **Privacyverklaring** is opgesteld zonder juridische toetsing; laat haar bij gelegenheid nalezen.
- `npm run check:launch` controleert alleen open velden en registratie, geen juridische volledigheid.

### Blokkades vóór openbare registratie (blijft dicht)
Definitieve privacyverklaring incl. community, verifieerbare ouderlijke toestemming (<16), wis-/intrekprotocol,
Turnstile-sleutels. Pas daarna `REGISTRATION_ENABLED = "true"` én `REGISTRATION_OPEN = true`, na expliciet akkoord.

### Livegang (draaiboek)

**Vastgelegd vóór de wijziging (2026-10-10, alleen-lezen):**
- Cloudflare-zone: exact `okkiedarts.nl` (id `e8b354129b1f7ca0a95f6e39676857db`), plan Free, status *initializing*,
  toegewezen nameservers `kayden.ns.cloudflare.com` en `sloan.ns.cloudflare.com`. Cloudflare had **0 records** geïmporteerd.
- STRATO (oude nameservers `shades01.rzone.de`, `docks12.rzone.de`, SOA-serial 2026101024):
  A `217.160.0.51`, AAAA `2001:8d8:100f:f000::200` (STRATO-parkeerpagina), CNAME `www` → `okkiedarts.nl`,
  MX 5 `smtp.rzone.de` (ook als wildcard op subdomeinen), TXT `_dmarc` = `v=DMARC1;p=reject;`. Geen SPF of andere TXT.
  Het STRATO-pakket heeft geen e-mailfunctie.

**Stappen (eigenaar = E, Claude = C):**
1. E: in Cloudflare de te bewaren records toevoegen, vóór de omzetting: `MX @ smtp.rzone.de` (prioriteit 5) en
   `TXT _dmarc "v=DMARC1;p=reject;"`. A/AAAA en www worden vervangen door de website (stap 5).
2. E: bij STRATO alleen de nameservers → `kayden.ns.cloudflare.com`, `sloan.ns.cloudflare.com`.
3. C: wachten tot de zone *Active* is; DNS-records opnieuw controleren; *Always Use HTTPS* aan.
4. C: Worker `cd cloud && npx wrangler deploy --env production` (alleen api.okkiedarts.nl). Controle `/v1/health` → `registration: false`.
5. C: Cloudflare Pages-project (branch main, `npm run build:site`, uitvoer `dist`) met okkiedarts.nl; www via een
   doorverwijzing (301) naar okkiedarts.nl.
6. C: `community/config.js` `API_BASE = 'https://api.okkiedarts.nl'` (Turnstile leeg, `REGISTRATION_OPEN = false`), CI groen,
   daarna 1.3.1 naar main.
7. C: `node tools/live-check.mjs` (app) en `node tools/site-live-check.mjs` (website, www, HTTPS, API, geen adres/geheimen).
8. Later, apart: Cloudflare Access voor beheer.okkiedarts.nl, de drie Worker-secrets, dan pas de beheerroute.

## Gewenste online indeling

| Adres | Functie |
|---|---|
| https://okkiedarts.nl/ | Publieke website met uitleg en animaties |
| https://okkiedarts.nl/uitleg/ | Interactieve kinderuitleg |
| https://martijndbesten.github.io/dartlog/ | De dartapp met bestaande scores (en `/community/` voor het profiel) |
| https://api.okkiedarts.nl/v1/... | Online statistieken en ranglijst (Worker + D1) |
| https://beheer.okkiedarts.nl/beheer | Privébeheerscherm, zodra Cloudflare Access is ingesteld |

**Geen tweede app op okkiedarts.nl.** Trainingen staan in localStorage van de GitHub Pages-origin; een kopie op het nieuwe
domein zou leeg beginnen. `npm run build:site` bouwt daarom alleen website + uitleg en de CI faalt als `dist/app` bestaat.
Zet ook nooit een custom domain op de GitHub-repository (dan verhuist de app wél, met lege opslag).

De website krijgt een Cloudflare Pages-project. Cloudflare Pages build:
- GitHub repository: MartijndBesten/dartlog
- productiebranch: main, na review en uitdrukkelijk akkoord
- build command: npm run build:site
- output directory: dist
- standaard Node 22 (of ondersteunde Node-versie)

## Stap 1: domein en DNS (UITSLUITEND NA AKKOORD)

1. Log zelf in op STRATO. Deel geen wachtwoorden met een AI-assistent.
2. Maak een Cloudflare-account of log in. Voeg okkiedarts.nl als zone toe.
3. Noteer vooraf alle DNS-records bij STRATO (MX, TXT/SPF/DKIM/DMARC, A, CNAME, eventueel bestaande redirect). Controleer op e-maildiensten.
4. Cloudflare genereert namenservers. Verplaats pas na controle van DNS-records de delegatie bij STRATO naar die toegewezen Cloudflare-namenservers.
5. Wacht tot Cloudflare de zone als actief toont; controleer of eventuele mail blijft werken. Het domein blijft geregistreerd bij STRATO.
6. Schakel geen STRATO-hostingabonnement of extra SSL-pakket in.
7. Configureer Cloudflare Pages met eigen domein okkiedarts.nl; laat www desgewenst doorsturen naar het hoofddomein.

Bij STRATO: Domeinen → Domeinbeheer → Configureren → DNS → NS-records, volgens hun actuele documentatie. Controleer de exacte interface zelf, deze kan wijzigen.

## Stap 2: Cloudflare D1 en Workers

Pas de Cloudflare-configuratie aan nadat DNS actief is en de gebruiker akkoord geeft.

    cd cloud
    npm install
    npx wrangler login
    npx wrangler d1 create okkie-community

Neem het echte database-ID op in cloud/wrangler.toml, niet in een secret. Voer daarna uit:

    npx wrangler d1 migrations apply okkie-community --remote

Maak Turnstile voor de juiste production host(s). Zet de geheime sleutel via Wrangler; zet deze NOOIT in GitHub of frontend.

    npx wrangler secret put TURNSTILE_SECRET

Cloudflare Access:
- Maak een Access self-hosted application met hostname beheer.okkiedarts.nl (bescherm ALLE paden op die host).
- Authenticeer alleen goedgekeurde beheerder(s) via een allow-policy, bij voorkeur met MFA.
- Kopieer de Access Application Audience tag en team domain uit jouw eigen Cloudflare-account.
- Zet deze via Worker secrets, niet in publieke repository:

    npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
    npx wrangler secret put CF_ACCESS_AUD
    npx wrangler secret put ADMIN_ALLOWED_EMAILS

De admin API valideert daarnaast zelf de cryptografische handtekening van de Access-JWT, audience, issuer, geldigheidsduur, toegestane e-mail en juiste hostname. Zonder deze waarden is toegang gesloten.

Na accountconfiguratie en pas na akkoord:

    npx wrangler deploy --env production

Controleer de routes api.okkiedarts.nl en beheer.okkiedarts.nl. Het dashboard vereist login.

## Stap 3: frontend koppelen

Vul na gecontroleerde backend-uitrol de publieke waarden in in community/config.js:
- API_BASE = 'https://api.okkiedarts.nl'
- TURNSTILE_SITE_KEY = de openbare Turnstile-sitekey (geen secret)

Stel ALLOWED_ORIGINS in voor https://okkiedarts.nl, https://www.okkiedarts.nl en https://martijndbesten.github.io.
Bevestig dat registratie pas werkt als consent, beveiliging en database klaar zijn.

Publiceer Cloudflare Pages uitsluitend na toestemming. Controleer DNS/HTTPS.
Een nieuw domein is een andere browser-origin dan de bestaande GitHub Pages-PWA: bestaande lokale statistieken verhuizen niet vanzelf. Informeer bestaande gebruikers en ondersteun handmatige back-up/import voordat ze de nieuwe PWA gebruiken. Verwijder de oude installatie niet.

## Stap 4: privébeheerscherm en meetgegevens

Het dashboard in de Worker geeft:
- geregistreerde communityprofielen;
- zichtbare profielen;
- profielen die in de afgelopen zeven dagen statistieken hebben geüpload;
- gedeelde scoretrainingen (alle tijden);
- aantal gedeelde scoretrainingen per week, laatste 12 weken.

Deze gegevens zijn niet hetzelfde als exact unieke gebruikers of geïnstalleerde apps. Offline gebruikers zonder communityprofiel tellen niet mee.

Configureer apart **Cloudflare Web Analytics** om bezoekers en paginabezoeken op het nieuwe domein privacyvriendelijk te meten. Zet hiervoor de echte site-token na autorisatie in de frontend; geen zelfbedachte analyticsconfiguratie. Bekijk de bezoekerscijfers via Cloudflare dashboard. Houd bij in een privacyverklaring dat analytics wordt gebruikt. Deel geen ruwe individuele bezoekgegevens in de publieke community.

## Stap 5: beveiliging/privacy/productkwaliteit — verplicht vóór publieke registratie

- Maak een definitieve AVG-privacyverklaring met eigenaar, contact, grondslagen, bewaartermijnen, derde partijen en rechten.
- Maak een beheerbaar protocol voor toestemmingsintrekking en het wissen van accounts.
- Voor kinderen jonger dan 16: ouderbeheer en verifieerbare ouderlijke toestemming laten beoordelen. Een vinkje alleen is niet voldoende; open registratie voor minderjarigen niet activeren voordat dit is opgelost.
- Voeg anti-abuse/rate-limiting toe aan registratie, recovery en stats-sync (niet alleen CORS).
- Voeg integratietests toe met echte D1, registratie, herstel, terugtrekken toestemming, verbergen/wissen en het private beheerscherm.
- Test op fysieke iPhone en Android, ook offline en met bestaande trainingsgegevens.
- Test minimaal 20 simulatiespelers en meerdere apparaten.
- Plaats geen echte profielgegevens in openbare logs of testfixtures.
- Geen geldprijzen bij oncontroleerbare zelfingevoerde scores.

## Stap 6: release

1. Controleer volledige CI, browser-e2e en de privacy/security-review.
2. Bewaar back-up van de huidige code en voorbeeldgebruikersdata; wijs gebruikers op hun eigen back-ups.
3. Maak pas na expliciete goedkeuring PR #1 gereed voor merge en merge naar main.
4. Controleer Pages, Worker, D1, SSL, Access-login, registratie, de ranglijst en de app op het nieuwe domein.
5. Bestaande gebruikers via oude GitHub Pages-URL blijven werken; geef heldere importinstructies voor overstap.

## Vrijgavevoorwaarden

Ga niet live met communityprofielen zolang Cloudflare-account, Turnstile, D1, toegangsbeheer, ouderregeling en privacydocumentatie niet compleet en getest zijn.

**Huidige stand:** code voorbereid; zonder accountautorisatie kunnen wij geen zone/DNS wijzigen, externe database werkelijk creëren of de echte applicatie live controleren.
