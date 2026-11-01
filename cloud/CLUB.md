# OKKIE. Club (proef)

Besloten clubruimte per dartvereniging: weekoefening op eigen tijd, clubranglijst die zondag 22:00 sluit,
vormranglijst (gemiddelde laatste 4 weken), teams met captain-overzicht en een clubfeed. Concept: Claude Doc
*OKKIE. Club – onderzoek en concept* (1 november 2026). Code: `src/clubs.js`, migratie `migrations/0009_clubs.sql`,
tests `tests/clubs.test.js`.

**Bewust niet:** competitiescores, openbare ranglijsten, chat. **MVP alleen 16+.**

## Aan/uit en proefclubs

| Instelling | Staging | Productie |
|---|---|---|
| `CLUBS_ENABLED` (var, alleen exact `"true"` opent) | `"true"` | `"false"`; migratie 0009 **niet** uitgevoerd |
| `CLUB_PILOT_CODES` (secret, komma-gescheiden, min. 16 tekens) | via `wrangler secret put` | niet gezet |

- Vlag uit: `/v1/clubs*` geeft 404, registreren met een club- of proefclubcode geeft 403, `/v1/health` meldt `clubs: false`.
- Een club aanmaken kan alleen met een proefclubcode, en elke code werkt één keer (`app_flags`: `clubpilot:<sha256>`).
  Martijn geeft per proefclub één code aan de contactpersoon.
- `CLUB_TEST_NOW` bestaat alleen voor tests (vaste tijd) en staat nooit in `wrangler.toml` (dat bewaakt `tests/omgevingen.test.js`).

## Datamodel (D1)

| Tabel | Inhoud |
|---|---|
| `clubs` | naam, uitnodigingscode (8 tekens, zonder 0/O/1/I/L, ook als QR), max. 150 leden |
| `club_members` | rol `admin`/`captain`/`member`, status `pending`/`active`, team |
| `club_teams` | naam, captain |
| `club_challenges` | één weekoefening per club per week (maandag, Europe/Amsterdam): `score30`, `score60`, `score99`, `clock` |
| `club_results` | beste resultaat per lid per weekoefening: punten, of pijlen bij rond de klok |
| `club_feed` | alleen trainingen die het lid per training zelf deelt; 60 dagen bewaard |

Per training gaan alleen de soort, het aantal pijlen, de punten en de hoogste beurt naar de server. Nooit losse
pijlen. De vormranglijst gebruikt de weekcijfers die de app al synchroniseert (`stats`, `week:*`).

## Toegang (afgedwongen in `clubs.js`, getest)

- Een club bestaat alleen voor haar **actieve** leden. Voor alle anderen (wachtende aanvrager, verwijderd lid, lid van
  een andere club, verzonnen ID) geven alle routes 404 zonder gegevens.
- Elke query op clubgegevens filtert op `club_id` én op een actief lidmaatschap van de vrager in die club. De tests
  controleren dit op alle 16 routes van een andere club. Een mutatietest (filters tijdelijk weghalen) laat de tests falen.
- Beheerder: leden goedkeuren, afwijzen en verwijderen, rollen en teams, code vernieuwen, weekoefening kiezen,
  resultaten en feedberichten verwijderen, club opheffen. De laatste beheerder kan zichzelf niet degraderen.
- Captain: het overzicht van zijn eigen team (vorm over 4 weken, trainingen, resultaat van de weekoefening).
- Lid: club, ranglijsten en feed bekijken, eigen trainingen delen, eigen resultaat of bericht verwijderen.

## Clubprofiel en eigen clubtrainingen (`src/club-extras.js`, migratie 0010)

- **Clubnaam:** alleen de beheerder wijzigt hem (`PATCH /v1/clubs/:id`), met dezelfde naamcontrole.
- **Clublogo:**
  - de app accepteert alleen JPG of PNG tot 1 MB, snijdt vierkant bij, verkleint naar 256 × 256 en slaat op als
    JPEG (dat haalt EXIF en GPS weg, zoals B71);
  - de server accepteert alleen echte JPEG/PNG (gecontroleerd op de eerste bytes en de opgegeven soort), hoogstens
    200 kB, PNG hoogstens 512 px;
  - opslag in D1 (`club_logos`): geen extra Cloudflare-dienst nodig; R2 kan later achter dezelfde routes;
  - `GET /v1/clubs/:id/logo` werkt alleen met het token van een actief lid (`Cache-Control: private`);
  - zonder logo toont de app de initialen van de club;
  - clubnaam en logo zijn te melden via "Meld de clubnaam of het logo" (Leden).
- **Clubtrainingen** (`/v1/clubs/:id/exercises`):
  - aanmaken: de beheerder voor de hele club of een team; een captain alleen voor zijn eigen team;
  - velden: naam, uitleg (hoogstens 200 tekens), type, instellingen, start- en einddatum (hoogstens 56 dagen,
    sluit op de einddatum om 22:00 Amsterdam), en hele club of team; hoogstens 10 lopende per club;
  - typen:
    - `score`: eigen aantal pijlen, 9 tot 300;
    - `clock`: rond de klok;
    - `target`: N pijlen op één vak, bijv. D16;
    - `checkout`: 1 tot 10 uitgooibare waarden;
  - score en klok stuurt de speler in vanuit een echte training op de telefoon; doel en checkout voert hij zelf in
    als aantal treffers, en de ranglijst toont dat dat handmatig is;
  - zichtbaarheid: een clubbrede training ziet elk lid; een teamtraining alleen dat team, zijn captain en de
    beheerders; andere clubs zien niets (404);
  - per training een eigen ranglijst met het beste resultaat per lid;
  - club verlaten wist ook deze resultaten.

## Verlaten en verwijderen

- **Club verlaten** (`DELETE /v1/clubs/:id/me`): lidmaatschap, weekresultaten en feedberichten in die club worden
  gewist. Andere clubs en de trainingen op de telefoon blijven.
- Vertrekt de laatste beheerder, dan wordt een captain beheerder, anders het langst zittende lid. Is er niemand meer,
  dan verdwijnt de club met alles.
- **Account verwijderen** (`DELETE /v1/me`, ook door beheer of de opschoning): uit alle clubs, met alle clubgegevens.
- **Club opheffen** door een beheerder: alle leden, teams, oefeningen, resultaten en feed weg; accounts blijven bestaan.
- Melden en verbergen werkt in de app zoals bij Darters (verbergen op het toestel, melden per e-mail). Daarnaast kan
  de beheerder een resultaat, een bericht of een lid verwijderen.

## API

Alle routes behalve `preview` vereisen een bearer-token. Schrijven kan alleen vanaf `ALLOWED_ORIGINS`.

| Methode en pad | Wie |
|---|---|
| `POST /v1/clubs/preview` `{code}` → naam en aantal leden | iedereen (met rate limit) |
| `GET /v1/clubs` → mijn clubs (ook openstaande aanvragen) | ingelogd |
| `POST /v1/clubs` `{name, pilotCode, consent:true}` | 16+ met proefclubcode |
| `POST /v1/clubs/join` `{code, consent:true}` → aanvraag | 16+ |
| `GET /v1/clubs/:id` → club, leden, teams, weekoefening met ranglijst (code alleen voor beheerders) | lid |
| `PATCH` / `DELETE /v1/clubs/:id`, `POST /v1/clubs/:id/code` | beheerder |
| `GET /v1/clubs/:id/requests`, `POST /v1/clubs/:id/requests/:handle` `{approve}` | beheerder |
| `PATCH /v1/clubs/:id/members/:handle` `{role?, teamId?}`, `DELETE …` | beheerder |
| `POST /v1/clubs/:id/teams`, `PATCH` / `DELETE …/teams/:teamId` `{name?, captain?}` | beheerder |
| `GET /v1/clubs/:id/teams/:teamId` → captain-overzicht | captain van dat team, beheerder |
| `PUT /v1/clubs/:id/challenge` `{kind, week?:'next'}`; `GET …/challenge?week=previous\|next` | beheerder; lid |
| `POST /v1/clubs/:id/trainings` `{training:{trainingId,kind,darts,points,high}, feed, challenge}` | lid |
| `DELETE /v1/clubs/:id/results/:handle` (lopende week) | eigen resultaat, of beheerder |
| `GET /v1/clubs/:id/feed`, `DELETE …/feed/:itemId` | lid; eigen bericht, of beheerder |
| `GET /v1/clubs/:id/form` → vormranglijst (min. 30 pijlen in 4 weken) | lid |
| `DELETE /v1/clubs/:id/me` → club verlaten of aanvraag intrekken, met wissen | lid of aanvrager |

Registreren voor Club: `POST /v1/register` `{nickname, age:'adult', clubCode}` of `{…, pilotCode}`. Dit geeft altijd
een niet-openbaar profiel.

## Nog niet

- Checkout- en finishpercentages: de app synchroniseert die niet, dus het captain-overzicht toont ze niet.
- Jeugd (onder 16): pas later, met een ouderroute en DPIA. Zie B55 en `VRIENDEN.md` voor de bestaande ouderlink.
- Trainer wijst oefeningen toe, duels, clubrecords en club-tegen-club (zie het concept, onder "Later").
