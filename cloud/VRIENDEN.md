# OKKIE. Mijn vrienden — ontwerp, rekenregels en livegang

Status: **gebouwd en getest op branch `feature/okkie-vrienden` (app 1.4.0). Niet live.** In productie staat
`GROUPS_ENABLED = "false"` (Worker) en `GROUPS_OPEN = false` (app). Niets wordt geactiveerd zonder akkoord van de eigenaar.

## 1. Inventarisatie en keuze

Hergebruikt (geen tweede systeem):

| Bestaand onderdeel | Gebruik in Mijn vrienden |
|---|---|
| `members` (nickname, token, herstelcode, gehasht) | Hetzelfde profiel; groepsprofielen hebben `visible = 0` en verschijnen nooit openbaar |
| `stats` (samengevatte cijfers per periode) | Dezelfde cijfers; uitgebreid met `best60` en `best99` |
| `js/community-sync.js` (`publicSnapshots`, `syncAccount`) | Zelfde synchronisatie na elke training; geen losse pijlen |
| Herstel (`/v1/recover`) | Profiel op een nieuwe telefoon terugzetten |
| Rate limiting, CORS, beveiligingsheaders, foutafhandeling | Ongewijzigd, ook voor de groepsroutes |
| Bouwstenen B16/B31 (trippie: groepen, uitnodigingen, tenant-isolatie) en B23 (gehashte tokens) | Als patroon, niet als code (andere stack) |

Nieuw:
- `cloud/migrations/0003_vriendengroepen.sql`: `groups`, `group_members` (rol + deelkeuze per groep), `group_invites`
  (alleen SHA-256 van het token), kolommen `best60`/`best99`, `age_group`, `guardian_member_id`, `guardian_verified_at`.
  Additief: bestaande gegevens blijven ongewijzigd.
- `cloud/src/groups.js`: alle groepsroutes en **alle** toegangscontrole (server-side).
- `vrienden/` (pagina in de app, zelfde origin als de trainingen) en `js/group-stats.js` (rekenregels).

Schaal: één D1-database, indexen op lidmaatschap en uitnodigingen, groepsdetail in twee queries ongeacht het aantal leden.
Grenzen (instelbaar in `LIMITS`): 50 leden per groep, 10 groepen per speler, 20 open uitnodigingen per groep, link max.
30 dagen en 50 personen. Honderden gebruikers en vele groepen passen ruim; ophogen is een constante wijzigen.

## 2. Accounts en toegang

- **Openbare registratie blijft dicht** (`REGISTRATION_ENABLED = "false"`).
- Met `GROUPS_ENABLED = "true"` kan een account alleen ontstaan:
  1. via een **geldige uitnodiging** (`inviteToken`), of
  2. met de **oprichterscode** (Worker-secret `GROUP_FOUNDER_CODE`, min. 16 tekens) voor het allereerste account.
  Beide maken een besloten profiel (`visible = 0`) en vereisen `age: "adult"` (16+).
- Een uitnodigingslink geeft **geen** toegang: `/v1/invites/preview` toont alleen groepsnaam en aantal leden. Lid worden
  vereist een ingelogd profiel én een expliciete deelkeuze. Het token staat in het `#`-deel van de link (gaat niet naar
  servers of Referer) en wordt na openen uit de adresbalk gehaald.
- Niet-leden krijgen op elke groepsroute **404** (ook met een geldig groeps-ID): een groep is niet te vinden.
- Rollen: eigenaar (alles, rollen wijzigen, opheffen), beheerder (uitnodigen, intrekken, gewone leden verwijderen,
  naam wijzigen), lid (bekijken, eigen deelkeuze, verlaten). Eigenaar vertrekt → beheerder of langst aanwezige lid wordt
  eigenaar; laatste lid weg → groep weg.
- Gebruik van een link wordt atomair opgehoogd; een link werkt nooit vaker dan toegestaan.

## 3. Privacy

- Per groep kiest een speler expliciet (standaard niets aangevinkt): **gemiddelde** (gemiddelde, trainingen, weektrend),
  **records** (hoogste beurt, beste 30/60/99, 100+/140+/180) en **challenge** (eerste 30-pijlentraining van de week).
  De server stuurt alleen gekozen onderdelen mee; niet-gedeeld verschijnt nergens, ook niet als 0.
- Nooit online: losse pijlen, beurten, tijdstippen, wedstrijden, volledige trainingsgeschiedenis, andere lokale spelers.
- **Delen stoppen**: `DELETE /v1/me/snapshots` wist alle gedeelde cijfers en de app stopt met bijwerken.
  **Profiel verwijderen**: `DELETE /v1/me` haalt de speler uit alle groepen en wist alles online.
  Lokale trainingen blijven altijd op de telefoon.
- De automatische opschoning verwijdert accounts zonder cijfers na 30 dagen, **behalve** als ze lid zijn van een groep.
- Nicknames: 2–24 tekens, geen HTML of e-mailadres; de app raadt een bijnaam of voornaam aan.

## 4. Kinderen onder 16 — verifieerbare ouderlijke toestemming (ontwerp, nog niet actief)

Nu: minderjarigen kunnen **geen** account maken (`age` ≠ `"adult"` → 403) en een account met `age_group = 'minor'`
zonder `guardian_verified_at` wordt bij groepen maken en lid worden server-side geweigerd. De app legt dit kindvriendelijk
uit; trainen blijft volledig werken.

Voorgestelde procedure (vereist een besluit en waarschijnlijk juridische toets vóór activering):
1. **Ouder eerst**: de ouder/verzorger heeft zelf een volwassen OKKIE.-profiel en is lid van dezelfde groep.
2. **Verificatie van de ouder**: e-mailbevestiging naar een adres van de ouder (Cloudflare Email Sending of een
   mailbrug, zie bouwsteen B24 met testomleiding), plus een tweede factor die bij de groep past: de **groepseigenaar
   bevestigt** dat hij deze ouder persoonlijk kent. Voor zwaardere zekerheid: iDIN of een kleine verificatiebetaling
   (bewust nu niet, geen betaalgegevens).
3. **Koppelen**: het kind-profiel toont een eenmalige code; de ouder voert die in op zijn eigen telefoon. De server zet
   `guardian_member_id` en pas na stap 2 `guardian_verified_at`. Alles in het auditlog.
4. **Beheer door de ouder**: de ouder ziet en wijzigt de deelkeuze van het kind, kan delen stoppen en het profiel
   verwijderen; het kind kan zelf niet meer delen dan de ouder toestaat. Intrekken = direct alle gedeelde cijfers weg.
5. **Standaard voor kinderen**: alleen besloten groepen (nooit openbaar), alleen nickname, geen records van andere
   groepen zichtbaar, maximaal de groepen die de ouder goedkeurt.
De datakolommen hiervoor bestaan al (`age_group`, `guardian_member_id`, `guardian_verified_at`); de schermen en de
verificatiestap worden pas gebouwd na het besluit over stap 2.

## 5. Rekenregels

| Cijfer | Definitie |
|---|---|
| Gemiddelde | punten × 3 / pijlen, gewogen per pijl over alle gedeelde scoretrainingen |
| Week | maandag 00:00 t/m zondag (UTC), gelijk aan app en openbare ranglijst |
| Gemiddelde deze week | zelfde formule over de trainingen van deze week |
| Beste 30 / 60 / 99 | hoogste totaal in één afgeronde training van **precies** 30/60/99 pijlen, als gemiddelde per 3 pijlen (÷10, ÷20, ÷33) |
| Hoogste beurt | hoogste score van 3 pijlen ooit |
| Trainingen | aantal afgeronde scoretrainingen (geen onvolledige, geen 301/501, geen geïmporteerde samenvattingen) |
| 30-pijlenchallenge | totaal van de **eerste** afgeronde 30-pijlentraining van de week (iedereen dezelfde opdracht) |
| Verbetering | gemiddelde deze week − gemiddelde van de weken ervoor in het venster van 8 weken; beide ≥ 30 pijlen |
| Record deze week | het beste 30-pijlengemiddelde of de hoogste beurt is deze week gegooid (verbeterd of geëvenaard) |

Ranglijsten: algemeen (≥ 90 pijlen), week (≥ 30 pijlen deze week), challenge, verbetering, records per soort.
Gelijke stand: zelfde plaats; volgorde dan op meer pijlen, daarna alfabetisch. Wie te weinig pijlen heeft of iets niet
deelt, staat onder de lijst als "nog niet op deze lijst" en wordt nooit als 0 meegeteld. Stijg-/daalpijlen vergelijken
met de vorige keer dat deze telefoon de lijst bekeek (lokaal opgeslagen, niets online).
Beginners: de verbeteringslijst beloont vooruitgang, niet het niveau.

## 6. Groepschallenges (onderzoek voor later)

Goed haalbaar op dit fundament: een tabel `group_challenges(id, group_id, kind, starts_at, ends_at, target, created_by)`
en een samenvatting per lid per challenge (`challenge_results`). Varianten: "meeste 30-pijlentrainingen deze maand",
"hoogste gemiddelde over 99 pijlen in deze week", "rond de klok in zo min mogelijk pijlen". De app stuurt per actieve
challenge alleen het eindcijfer mee (zelfde privacymodel). Eerlijkheid: alleen trainingen die binnen de periode zijn
afgerond tellen; scores blijven zelf ingevoerd, dus geen geldprijzen. Geschatte omvang: één migratie, drie routes,
één tabblad.

## 7. Testen

- `cloud/tests/groups.test.js`: 25 vrienden in één groep, meerdere groepen en eigenaren, isolatie (alle methoden op een
  vreemde groep → 404), uitnodigingen (verlopen, ingetrokken, maximaal gebruik, ongeldig, link zonder account), rollen,
  deelkeuze-filtering, delen stoppen, account verwijderen met eigenaarsoverdracht, limieten, minderjarigen, rate limiting.
- `tests/unit/group-stats.test.js`: rekenregels.
- `tests/e2e/vrienden.spec.js`: twee "telefoons" (oprichten, uitnodigen, lid worden, dashboard, vergelijken, intrekken,
  verlaten), minderjarige, "binnenkort"-stand zoals live, offline, toetsenbord en verminderde beweging.
  Gebruikt `tools/dev-api.mjs`: de echte Worker-code op een tijdelijke SQLite in het geheugen, alleen localhost.
- `tools/upgrade-check.mjs` in GitHub Actions: update van de live versie naar 1.4.0 met bestaande gegevens.

## 8. Wat nodig is om live te gaan (alleen na akkoord)

1. Eigenaar: akkoord op de functie en op de privacytekst (sectie "Mijn vrienden" staat klaar in `ontdek/privacy/`).
2. Eigenaar: besluit over minderjarigen (blijven geblokkeerd, of procedure uit §4 laten bouwen).
3. API live op api.okkiedarts.nl (livegang 1.3.x) en migratie `0003` op productie: `npx wrangler d1 migrations apply okkie-community --remote --env production`
   (additief; eerst op staging).
4. `npx wrangler secret put GROUP_FOUNDER_CODE --env production` (zelf een lange code kiezen, niet delen).
5. `GROUPS_ENABLED = "true"` in `[env.production.vars]`, deploy; `GROUPS_OPEN = true` in `community/config.js`, release 1.4.0.
6. Privacyverklaring publiceren met de sectie Mijn vrienden; daarna eerste groep maken met de oprichterscode.
