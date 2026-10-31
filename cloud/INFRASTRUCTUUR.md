# OKKIE. — Infrastructuur voor okkiedarts.nl, Community-API en beheer

Status: **voorbereid op branch `infra/cloudflare-community`. Niets staat live, DNS is niet gewijzigd.**
Dit document beschrijft de doelarchitectuur, wat al klaar is, en de exacte stappen (met wie ze kan uitvoeren).

> **Stand 11 oktober 2026 (actueler dan de rest van dit document):** de app staat op app.okkiedarts.nl (GitHub Pages,
> repo `okkie-app`), de website op okkiedarts.nl (GitHub Pages, repo `okkiedarts-site`). De API draait als Worker
> `okkie-api` op workers.dev (staging: `okkie-community-api`), met D1 `okkie-community` (migraties 0001–0003).
> De Cloudflare-zone okkiedarts.nl is **niet** actief (nameservers staan bij STRATO, DNSSEC aan); daarom geen
> api.okkiedarts.nl en geen beheer.okkiedarts.nl. Beheer is dicht (geen Access-secrets). Zie VRIENDEN.md.
> Sinds 1.7.2 staat het gebruik van de app (anonieme dagteller, `src/usage.js`) ook in de besloten inbox van Hulp & feedback
> (`/v1/feedback/inbox`, geheime sleutel FEEDBACK_KEY); het Access-dashboard toont hetzelfde zodra Access is ingesteld.

## 1. Architectuur

```
okkiedarts.nl            publieke website (introductie, installatie-uitleg, openbare ranglijst)
www.okkiedarts.nl        → doorverwijzing naar okkiedarts.nl
api.okkiedarts.nl        Cloudflare Worker "okkie-community-api" + D1 "okkie-community"   (deze map)
okkiedarts.nl/beheer     privébeheerdersdashboard, afgeschermd met Cloudflare Access (alleen jouw e-mailadres)
martijndbesten.github.io/dartlog/            de bestaande OKKIE.-app — BLIJFT HIER
martijndbesten.github.io/dartlog/community/  profiel koppelen/beheren (moet op dezelfde origin als de app staan)
```

**Waarom de app niet mee verhuist.** Trainingen staan in `localStorage` van de origin `martijndbesten.github.io`.
Een andere domeinnaam is een andere origin: de data gaat niet mee. Daarom:

- ⚠️ **Stel in de GitHub-repository `dartlog` géén custom domain in.** GitHub Pages zou dan *alle* pagina's, dus ook de app,
  permanent doorsturen naar okkiedarts.nl, en iedere speler zou zijn trainingen kwijt lijken te zijn.
- De publieke website wordt daarom apart gehost (Cloudflare Pages of Workers Static Assets, zie §4), met links naar de app.
- De pagina `/dartlog/community/` leest de lokale speler uit `localStorage` en hoort dus bij de app-origin. Op okkiedarts.nl
  komt alleen de leesbare ranglijst (via de API) plus een link "Profiel koppelen" naar de app-origin.
- Een eventuele verhuizing van de app kan later met een migratiewizard (back-up → import), zoals COMMUNITY-SETUP.md al zegt.

## 2. Wat is klaar in deze branch

| Onderdeel | Bestand | Status |
|---|---|---|
| Worker-API met CORS-allowlist, Turnstile, beveiligingsheaders, JSON-/groottecontrole | `src/worker.js` | klaar, getest |
| Rate limiting (per IP bij registratie/herstel, per account bij wijzigingen) | `src/worker.js`, `wrangler.toml` | klaar; werkt zodra de bindings bestaan, anders stilletjes uit |
| Beheer-API (`/v1/admin/*`): overzicht, ledenlijst, verbergen, verwijderen, logboek | `src/worker.js` | basis klaar voor het dashboard; nooit hashes/tokens naar buiten |
| Beheerauthenticatie: uitsluitend Cloudflare Access-JWT op beheer.okkiedarts.nl (e-mail-allowlist, geen tokenroute) | `src/admin-auth.js` | klaar, getest met echte RS256-handtekeningen |
| Dagelijkse opschoning (bewaartermijnen) | `src/worker.js` (`scheduled`), `wrangler.toml` (`crons`) | klaar, getest |
| D1-schema + migratie 0002 (logboek, indexen) | `migrations/` | klaar |
| Omgevingen staging (workers.dev) en production (api.okkiedarts.nl) | `wrangler.toml` | klaar; database-ID's nog invullen |
| Integratietests van de hele API zonder Cloudflare-account | `tests/api.test.js`, `tests/d1-shim.js` | klaar (`npm run check`) |
| CI op GitHub (syntax, unit-tests app + cloud, `wrangler deploy --dry-run`) | `.github/workflows/community-check.yml` | klaar |

Bestaande code van de ontwikkelbranch (pagina's `ontdek/`, `community/`, `js/community-sync.js`, back-upherinnering) is niet gewijzigd.
In `worker.js` zijn alleen SQL-tekstliterals van `"…"` naar `'…'` gezet (SQLite leest dubbele aanhalingstekens als kolomnamen) en is de functionaliteit uitgebreid; alle bestaande routes gedragen zich hetzelfde.

## 3. Stappenplan (wie doet wat)

Legenda: 🟢 kan Claude zelfstandig · 🟡 Claude kan het uitvoeren zodra jij toegang geeft · 🔴 alleen jij (account/eigenaar)

### A. Cloudflare-account en domein (eenmalig)
1. 🔴 Cloudflare-account aanmaken of inloggen; zone `okkiedarts.nl` toevoegen (Free-plan volstaat).
2. 🔴 Bij STRATO de **nameservers** van okkiedarts.nl omzetten naar de twee die Cloudflare toont. Dit is de enige DNS-wijziging bij STRATO;
   pas doen op het moment dat je live wilt. Tot die tijd verandert er niets. (Alternatief zonder nameserverwissel is er niet voor
   Workers custom domains en Access.)
3. 🔴 In Cloudflare → SSL/TLS: modus *Full (strict)*, *Always use HTTPS* aan, HSTS mag later.

### B. Database, secrets en API
4. 🟡 `cd cloud && npm install && npx wrangler login` (opent de browser; jij logt in en autoriseert).
5. 🟡 `npx wrangler d1 create okkie-community-staging` en `npx wrangler d1 create okkie-community` → ID's in `wrangler.toml`.
6. 🟡 `npx wrangler d1 migrations apply okkie-community-staging --remote` en `… okkie-community --remote --env production`.
7. 🔴 Turnstile-widget aanmaken (Cloudflare → Turnstile): hostnames `martijndbesten.github.io` en `okkiedarts.nl`, type *Managed*.
   Je krijgt een **sitekey** (publiek, komt in `community/config.js`) en een **secret**.
8. 🟡 `npx wrangler secret put TURNSTILE_SECRET` (staging) en `… --env production`. Het secret wordt ingetypt, niet in Git gezet.
9. 🟡 `npx wrangler deploy` (staging op workers.dev) → smoke-test → `npx wrangler deploy --env production` (api.okkiedarts.nl).
   De productie-deploy maakt automatisch het DNS-record voor `api.okkiedarts.nl` aan (custom domain).

### C. Beheer (privédashboard)
10. 🔴 Cloudflare → Zero Trust → Access → Applications: *Self-hosted*, domein `okkiedarts.nl`, pad `/beheer` én `api.okkiedarts.nl/v1/admin`.
    Beleid: *Allow* → e-mailadres(sen) van de beheerder(s). Inloggen gaat dan via een eenmalige code per e-mail; er is geen eigen
    wachtwoordsysteem nodig.
11. 🟡 Uit de Access-applicatie: **AUD-tag** en **team domain** (`<naam>.cloudflareaccess.com`) → `ACCESS_AUD` en `ACCESS_TEAM_DOMAIN`
    in `wrangler.toml` (productie) → opnieuw deployen. Vanaf dan controleert de API het Access-JWT zelf (dubbele beveiliging).
12. 🟢 Het dashboard zelf (door ChatGPT in ontwikkeling) praat met `/v1/admin/overview`, `/v1/admin/members`,
    `PATCH/DELETE /v1/admin/members/:handle` en `/v1/admin/audit`. Lokaal is beheer dicht; de tests ondertekenen eigen Access-JWT's.

### D. Publieke website op okkiedarts.nl
13. 🟡 Aanbevolen: Cloudflare Pages-project gekoppeld aan deze repository (branch `main`, build-output = map met de statische site),
    custom domain `okkiedarts.nl` + `www` (redirect). Of: Workers Static Assets in deze Worker (`[assets]` in `wrangler.toml`).
    Keuze en mappenindeling van de site afstemmen met de pagina's uit de ontwikkelbranch (`ontdek/`, `community/`), omdat die nu nog
    relatieve links naar `../` (de app) gebruiken die op een eigen domein absoluut moeten worden.
14. 🟢 `community/config.js` invullen (API-URL en Turnstile-sitekey) en `ALLOWED_ORIGINS` controleren.

### E. Voor het live zetten
15. 🔴 Privacyverklaring en verwerkingsgrondslag (zie §6) publiceren op okkiedarts.nl; ouder/voogd-flow beoordelen.
16. 🟢 Volledige testronde: `npm test`, `npm run test:e2e`, `cd cloud && npm run check`, `node tools/upgrade-check.mjs`, echte telefoons.
17. 🔴 Akkoord geven → pull request naar `main` mergen → GitHub Pages publiceert de app-wijzigingen; Pages/Worker-deploys apart.

## 4. DNS-plan (pas uitvoeren bij go-live)

| Naam | Type | Waarde | Proxy | Opmerking |
|---|---|---|---|---|
| `okkiedarts.nl` | — | Cloudflare Pages custom domain (of Worker custom domain) | ☁️ | Cloudflare maakt het record zelf aan |
| `www` | CNAME | `okkiedarts.nl` | ☁️ | + Redirect Rule `www → apex` (301) |
| `api` | — | Worker custom domain (`wrangler deploy --env production`) | ☁️ | automatisch |
| `_dmarc` | TXT | `v=DMARC1; p=reject;` | — | er wordt geen mail verstuurd vanaf dit domein |
| `@` | TXT | `v=spf1 -all` | — | idem; voorkomt misbruik van de domeinnaam voor spam |

Niet doen: A-records van GitHub Pages op okkiedarts.nl zetten (zie §1).

## 5. Beveiliging (samenvatting)

- Geen wachtwoorden of e-mailadressen van spelers; tokens (256 bit) en herstelcodes worden alleen als SHA-256-hash opgeslagen.
- Registratie: Turnstile + rate limit 5/min per IP. Herstel: zelfde limiet. Wijzigingen: 60/min per account.
- Schrijfacties alleen vanaf `ALLOWED_ORIGINS`; `Content-Type` moet JSON zijn; verzoeken > 50 kB worden geweigerd.
- Beheer: Cloudflare Access vóór de route én JWT-verificatie in de Worker; alle beheeracties in `admin_audit`.
- Headers: `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS.
- Secrets alleen via `wrangler secret`; `.dev.vars` staat in `.gitignore`.
- Aanbevolen extra (Cloudflare-dashboard): WAF managed rules aan, Bot Fight Mode aan, logboek-alerts op 5xx.

## 6. Privacy (AVG) — wat er is ingebouwd en wat nog moet

Gegevensinventaris (server):

| Gegeven | Doel | Bewaartermijn |
|---|---|---|
| Nickname (zelfgekozen alias) | ranglijst tonen | tot verwijdering door speler/beheerder, of opschoning |
| Profielcode, token-hash, herstelcode-hash | inloggen zonder e-mail | idem |
| Geaggregeerde statistieken per week/maand/totaal | ranglijst, profiel | idem |
| Beheerlogboek (actie, profielcode, beheerder) | verantwoording | 12 maanden (handmatig opschonen) |
| IP-adres | alleen vluchtig voor rate limiting/Turnstile | niet opgeslagen in D1 |

Ingebouwd: toestemming per speler (expliciet vinkje), zelf verbergen, zelf verwijderen (direct en volledig), automatische opschoning
(nooit-gesynchroniseerde accounts na 30 dagen, inactieve accounts na 2 jaar), geen losse pijlen of tijdstippen.
Nog nodig vóór live (🔴): privacyverklaring op de website, beoordeling van de ouder/voogd-toestemming voor spelers onder 16,
en een contactadres voor verwijderverzoeken.

## 7. Lokaal ontwikkelen en testen

```bash
cd cloud
npm install
npm run check            # integratietests op node:sqlite (geen account nodig)
npx wrangler deploy --dry-run --outdir dist   # valideert wrangler.toml en bundelt (geen account nodig)
cp .dev.vars.example .dev.vars                 # lokale secrets (testsleutels)
npm run migrate:local && npm run dev           # lokale API met lokale D1 op http://localhost:8787
```

Zet voor een lokale test van de pagina's `API_BASE = 'http://localhost:8787'` in `community/config.js` (niet committen).

## Melding uit Darters afhandelen (sinds 1.8.0, ook nodig voor de App Store)

In Darters kan iedereen bij een profiel *Meld dit profiel* kiezen: dat opent een e-mail aan info@denckh.nl met de
profielcode (12 tekens). Afhandelen, liefst binnen een paar dagen:

1. Bekijk het profiel: `https://okkie-api.zaalverhuur-sion.workers.dev/v1/players/<profielcode>`.
2. Ongepast? Verwijderen via de beheer-API (`DELETE /v1/admin/members/<profielcode>`, achter Cloudflare Access) of,
   als het dashboard er nog niet is: `npx wrangler d1 execute okkie-community --remote --env production --command
   "DELETE FROM members WHERE handle = '<profielcode>'"` (gedeelde cijfers verdwijnen mee via de cascade; controleer
   dat met `SELECT` vóór en na).
3. Mail de melder kort terug en verwijder de melding uiterlijk na 180 dagen (privacyverklaring §6, *Melden en verbergen*).

