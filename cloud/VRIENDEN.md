# OKKIE. Mijn vrienden — ontwerp, rekenregels en livegang

Status: **gebouwd en getest op branch `feature/okkie-vrienden` (app 1.4.0), voor alle leeftijden. Niet live.** In productie staat
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
  (alleen SHA-256 van het token), `parent_consents` (ouderlinks per kind én per groep, gehasht), `app_flags` (gebruikte
  oprichterscodes, alleen als hash), kolommen `best60`/`best99`, `age_group`, `consent_at`, `consent_method`.
  Additief: bestaande gegevens blijven ongewijzigd. Geen geboortedatum, e-mail, telefoon of adres in het datamodel.
- `cloud/src/groups.js`: alle groepsroutes en **alle** toegangscontrole (server-side).
- `vrienden/` (pagina in de app, zelfde origin als de trainingen) en `js/group-stats.js` (rekenregels).

Schaal: één D1-database, indexen op lidmaatschap en uitnodigingen, groepsdetail in twee queries ongeacht het aantal leden.
Grenzen (instelbaar in `LIMITS`): 50 leden per groep, 10 groepen per speler, 20 open uitnodigingen per groep, link max.
30 dagen en 50 personen. Honderden gebruikers en vele groepen passen ruim; ophogen is een constante wijzigen.

## 2. Accounts en toegang

- **Openbare registratie blijft dicht** (`REGISTRATION_ENABLED = "false"`).
- Met `GROUPS_ENABLED = "true"` kan een account alleen ontstaan:
  1. via een **geldige uitnodiging** (`inviteToken`), of
  2. met een **oprichterscode** (Worker-secret `GROUP_FOUNDER_CODE`, één of meer komma-gescheiden codes van min. 16
     tekens). **Elke code werkt precies één keer** (ook bij gelijktijdige pogingen); alleen de hash van een gebruikte
     code wordt onthouden. Oprichters zijn 16+.
  Beide maken een besloten profiel (`visible = 0`). De speler kiest alleen een leeftijdsgroep: "16 of ouder" of
  "jonger dan 16" (geen geboortedatum). Zie §4 voor jonger dan 16.
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
- Naam: voornaam of bijnaam (2–24 tekens, geen HTML of e-mailadres); geen achternaam nodig.
- **Dataminimalisatie bij opslaan**: een besloten profiel bewaart alleen het totaal en de laatste 8 weken (wat de groep
  toont); maanden en oudere weken die de app meestuurt worden weggegooid. Jonger dan 16 en nog in geen groep mét gegeven
  toestemming: er worden **geen statistieken** bewaard (eerder bewaarde worden gewist); wel voornaam, leeftijdsgroep,
  gehashte inloggegevens en de openstaande aanvraag (groep, deelkeuze, bij een eigen groep de gekozen naam). Leeftijdsgroep en toestemming zijn voor groepsleden niet zichtbaar.
- Geen communicatie: geen chat, berichten, foto's, profielteksten of zoekfunctie. Groepen zijn niet vindbaar.

## 4. Alle leeftijden: grondslag en ouderlijke toestemming (onderzoek, geen juridisch advies)

**Productbesluit eigenaar (2026-10-10):** OKKIE. is voor alle leeftijden; geen 16+-app en geen ouderaccounts.
Hieronder de analyse waarop het ontwerp rust. **Er is geen naleving vastgesteld**; de punten onder "Resterende
blokkades" moeten eerst geregeld zijn.

**Zijn het persoonsgegevens?** Ja. Een voornaam met scores binnen een groep van vrienden is herleidbaar tot een persoon
(de groep kent elkaar). Dat ze "maar" dartscores zijn, maakt ze niet anoniem. De AVG geldt dus, ook voor kinderen.

**Mogelijke grondslagen voor online delen in een groep:**

| Grondslag | Kinderen < 16 | Beoordeling |
|---|---|---|
| Toestemming (art. 6 lid 1a) | Art. 8 AVG + art. 5 UAVG: toestemming van de ouder/verzorger nodig; de verwerker doet "redelijke inspanningen, rekening houdend met de beschikbare technologie" om dat te controleren (art. 8 lid 2) | **Gekozen standaard.** Past bij vrijwillig, per groep gekozen delen en is eenvoudig intrekbaar. Controle mag proportioneel zijn aan het risico |
| Uitvoering van de gevraagde dienst (art. 6 lid 1b) | Art. 8 geldt niet; wel handelingsbekwaamheid (art. 1:234 BW: toestemming ouder verondersteld voor wat voor de leeftijd gebruikelijk is, zoals een gratis app) | Mogelijk verdedigbaar omdat delen in de groep de kern is van wat de speler zelf vraagt. Toezichthouders lezen deze grondslag strikt (EDPB-richtsnoeren 2/2019). **Niet zelf gekozen; alleen na juridisch advies** (`MINOR_CONSENT = "dienst"`) |
| Gerechtvaardigd belang (art. 6 lid 1f) | Belangen van kinderen wegen zwaar | Minst geschikt; niet gebruikt |

**Gekozen oplossing: ouderlink per groep, zonder ouderprofiel.**
1. Het kind kiest "jonger dan 16". Er worden dan **geen statistieken** gedeeld of bewaard; wel voornaam, leeftijdsgroep,
   de inloggegevens (gehasht) en de openstaande aanvraag.
2. De app maakt een link (7 dagen geldig, alleen gehasht opgeslagen) die het kind via WhatsApp of het deelmenu naar een
   ouder/verzorger stuurt.
3. De ouder opent de link (geen app, geen account), ziet de voornaam van het kind, de groepsnaam en **precies** wat
   gedeeld wordt (en wat nooit), vinkt "Ik ben de ouder of verzorger" aan en tikt "Ik geef toestemming". De server legt
   `consent_at` en `consent_method = 'ouderlink'` vast; het kind wordt lid.
4. Toestemming is **per kind én per groep**: lid worden, zelf een groep oprichten en meer delen dan eerder goedgekeurd
   gaan elk via een eigen link. Minder delen mag het kind zelf. Een nieuwe aanvraag vervangt alleen een openstaande
   aanvraag voor hetzelfde doel, nooit een gegeven toestemming.
5. **Intrekken per groep** via elke bevestigde link voor die groep (die links verlopen niet zolang de toestemming actief
   is): het kind verlaat die groep en alle toestemmingen voor die groep vervallen; andere groepen blijven. Zit het kind
   daarna nergens meer in, dan worden het online profiel en alle gedeelde scores gewist. Verlaat het kind zelf een groep
   of haalt de beheerder het eruit, dan vervallen de toestemmingen voor die groep ook.

Waarom dit "redelijke inspanning" kan zijn: laag risico (geen communicatie, geen foto's, geen openbaar profiel, alleen
samengevatte scores binnen een besloten groep, eenvoudig intrekbaar), en de ouder ziet vooraf exact wat er gebeurt.
**Restrisico (bewust benoemd):** de server kan niet vaststellen dát de tikker echt de ouder is; een kind kan de link
zelf openen. Zwaardere controles (iDIN, betaalverificatie, e-mail met bevestiging) zijn mogelijk maar maken het minder
eenvoudig; dit is een afweging die bij de juridische toets hoort.

Aansluiting bij de **Code voor Kinderrechten** (NL, 2021): belang van het kind voorop, geen profilering of tracking,
dataminimalisatie, kindvriendelijke uitleg, geen misleidende ontwerpkeuzes, eenvoudig stoppen en wissen.

**Resterende blokkades vóór activering (concreet):**
1. **Juridische toets** van grondslag (toestemming via ouderlink, of "dienst") en van de lichte verificatie.
2. **Privacyverklaring** met de sectie Mijn vrienden publiceren (staat klaar in `ontdek/privacy/`, inclusief uitleg in
   gewone taal voor kinderen) — pas als de functie aangaat.
3. **Lichte DPIA** vastleggen (risicotabel hieronder als basis). Of een volledige DPIA verplicht is, hangt af van schaal
   en doelgroep; bij kinderen raadt de AP dat sterk aan.
4. **Verwerkersafspraken**: controleren dat de Cloudflare-verwerkersovereenkomst (DPA, onderdeel van de
   Cloudflare-voorwaarden) geaccepteerd is voor het account; GitHub Pages verwerkt alleen technische bezoekgegevens.
5. **Contact voor privacyverzoeken** (info@denckh.nl) staat al in de privacyverklaring.

**Risicotabel (basis voor de DPIA):**

| Risico | Maatregel |
|---|---|
| Onbekenden zien scores van kinderen | Groep niet vindbaar; 404 voor niet-leden; link alleen geeft geen inzage; links intrekbaar en beperkt in tijd/aantal |
| Pesten of contact | Geen chat, berichten, foto's of profielteksten; beheerder kan leden verwijderen |
| Te veel gegevens | Alleen voornaam, leeftijdsgroep en samengevatte scores; laatste 8 weken; per groep zelf gekozen |
| Toestemming niet echt van ouder | Ouder ziet alles vooraf; intrekken wist direct; restrisico benoemd (zie boven) |
| Gegevens blijven hangen | Delen stoppen, profiel verwijderen, intrekken door ouder, automatische opschoning |
| Lek van inlog- of linkgegevens | Tokens en links alleen gehasht; links in het `#`-deel; rate limiting |


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
  deelkeuze-filtering, delen stoppen, account verwijderen met eigenaarsoverdracht, limieten, rate limiting,
  oprichterscode eenmalig (ook gelijktijdig, meerdere codes), fictieve spelers van alle leeftijden (opa, ouders, kinderen
  met en zonder toestemming) in meerdere groepen, één kind in drie groepen met verschillende deelkeuzes (toestemming per
  groep geven en apart intrekken, zelf meer delen geweigerd, minder delen toegestaan, eigen groep via ouder, oude
  toestemming blijft geldig bij nieuwe aanvraag), ouderlink (aanvragen, bekijken, bevestigen, intrekken,
  verlopen, vervangen, opschonen), `MINOR_CONSENT = "dienst"`, dataminimalisatie bij opslaan.
- `tests/unit/group-stats.test.js`: rekenregels.
- `tests/e2e/vrienden.spec.js` (iPhone, Android, desktop): twee telefoons (oprichten, uitnodigen, lid worden, dashboard,
  vergelijken, intrekken, verlaten); drie telefoons (opa richt op, kind van 12 meldt zich, moeder geeft zonder account
  toestemming, spelersprofiel, vergelijken, moeder trekt in, trainingen van het kind onaangetast); "binnenkort"-stand
  zoals live; offline; toetsenbord en verminderde beweging.
  Gebruikt `tools/dev-api.mjs`: de echte Worker-code op een tijdelijke SQLite in het geheugen, alleen localhost.
- `tools/upgrade-check.mjs` in GitHub Actions: update van de live versie naar 1.4.0 met bestaande gegevens.

## 8. Wat nodig is om live te gaan (alleen na akkoord)

1. Resterende blokkades uit §4 afgerond: juridische toets (grondslag en ouderlink), lichte DPIA, verwerkersafspraken.
2. Eigenaar: akkoord op de functie en op de privacytekst (sectie "Mijn vrienden" staat klaar in `ontdek/privacy/`).
3. API live op api.okkiedarts.nl (livegang 1.3.x) en migratie `0003` eerst op staging, dan productie:
   `npx wrangler d1 migrations apply okkie-community --remote --env production` (additief).
4. `npx wrangler secret put GROUP_FOUNDER_CODE --env production` (zelf een of meer lange codes kiezen, niet delen).
5. `GROUPS_ENABLED = "true"` in `[env.production.vars]`, deploy; `GROUPS_OPEN = true` in `community/config.js`, release 1.4.0.
6. Privacyverklaring publiceren; daarna eerste groep maken met de oprichterscode.
