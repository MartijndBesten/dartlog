# Verhuizing naar app.okkiedarts.nl

Doel: één officiële dartapp op **https://app.okkiedarts.nl**, zonder dat iemand spelers of trainingen kwijtraakt.
Stand: **gebouwd en getest, niet geactiveerd.** Het oude adres ziet er voor gebruikers precies hetzelfde uit
zolang `PROD.open` in `js/transfer.js` op `false` staat.

## Waarom overzetten nodig is

- Trainingen staan in de browseropslag (`localStorage`) en die hoort bij één adres. Op app.okkiedarts.nl begint
  OKKIE. dus **leeg**, ook op dezelfde telefoon.
- Op iPhone kan een app op het beginscherm een **eigen** opslag hebben, los van Safari. Wie het oude adres als app
  heeft geïnstalleerd, moet vanuit díe app overzetten, en in de **nieuw geïnstalleerde** app plakken.
- Safari kan opslag van websites die niet op het beginscherm staan na enkele weken zonder gebruik opruimen.
  Installeren en af en toe een back-up blijven daarom belangrijk.

## Wat er is gebouwd (`js/transfer.js`, `js/install.js`)

| Route | Wanneer | Hoe |
|---|---|---|
| Automatisch | Oude app in een gewone browser | Opent de nieuwe app in een nieuw venster en geeft de gegevens via `postMessage` door, uitsluitend tussen precies deze twee adressen. |
| Overzetcode | Altijd, ook vanuit een geïnstalleerde iPhone-app | Gecomprimeerde code via kopiëren en plakken. Ook bruikbaar tussen Safari en de app op het beginscherm. |
| Back-upbestand | Reserve | Bestaande back-up, nu met hetzelfde controleverslag na terugzetten. |

Waarborgen:

- **Nooit iets wissen** op het oude adres, en **geen automatische doorverwijzing**.
- Samenvoegen op **ID**: twee keer overzetten geeft nooit dubbele spelers, trainingen of wedstrijden.
- Een lopende training of wedstrijd gaat mee, behalve als er in de nieuwe app al een loopt of als hij daar al is
  afgerond (anders telt hij dubbel). Het verslag zegt dat dan.
- **Controle per record, niet alleen aantallen.** Elke ontvangen speler, training (elke pijl) en wedstrijd wordt
  vergeleken met wat er na het samenvoegen staat, plus per speler trainingen, pijlen, punten en gemiddelde.
  Uitkomst (`verifyTransfer().status`):

  | Status | Betekenis | Melding |
  |---|---|---|
  | `identiek` | Alles precies gelijk | "Overgezet en gecontroleerd" (alleen dan) |
  | `aangepast` | Alles is er; iets is in deze app bewust anders: hernoemd, kleur, datum ingevuld bij een score uit een andere app, samengevoegde speler of bewust verwijderd. Die versie blijft. | "Overgezet, met bewuste verschillen" + lijst |
  | `aandacht` | Alles is er, maar de lopende training is niet overgenomen (hier loopt al een andere) | "Overgezet, behalve de lopende training" + wat te doen |
  | `probleem` | Iets ontbreekt, of zelfde ID met andere inhoud zonder verklaring (andere pijlen, ander soort training, andere wedstrijdbeurten), of een speler telt anders | "Niet alles is goed overgekomen"; de oude app markeert niets als overgezet |

  Bij een conflict wordt niets overschreven: de nieuwe app houdt zijn eigen versie, de oude app heeft alles nog.
- Bewust verwijderen en samenvoegen wordt onthouden (`removed`, `playerAliases` in de gegevens), zodat opnieuw
  overzetten niets terugbrengt en dat niet als fout telt.
- Een afgebroken of veranderde code wordt geweigerd (vingerafdruk van het pakket).
- **Online profielsleutels** (Community/Mijn vrienden) en koppelcodes van gasten gaan via het automatische venster
  mee (blijft op het toestel, alleen tussen precies het oude en nieuwe adres). In een **overzetcode alleen als je
  "Ook mijn online profiel meenemen" aanvinkt**: een code kan per ongeluk in een appje of notitie belanden. Na
  plakken via de knop wordt het klembord leeggemaakt. Niets overschrijft wat in de nieuwe app al staat.
- Twee spelers met dezelfde naam worden **niet** stilzwijgend samengevoegd. Het verslag vraagt het; samenvoegen kan
  alleen als ze nooit samen gooiden en niet allebei een online profiel hebben.
- Installatieadvies alleen op app.okkiedarts.nl, alleen voor nieuwe gebruikers, nooit in de geïnstalleerde app.
  Wie al trainingen heeft, krijgt eerst de overzetcode/back-up aangeboden.

Tests: `tests/unit/transfer.test.js`, `tests/e2e/verhuizing.spec.js` (twee echte, gescheiden origins:
`localhost` = oud, `127.0.0.1` = nieuw) en `tests/e2e/installatie.spec.js`. Dit zijn **gesimuleerde** telefoons in
Chromium. Safari op een echte iPhone (klembord, opslag van de beginscherm-app) is daarmee niet bewezen: zie stap 5.

## Absoluut niet doen

**Zet nooit een eigen domein op de repository `MartijndBesten/dartlog`.** GitHub stuurt
`martijndbesten.github.io/dartlog/` dan automatisch door naar dat domein. Bestaande spelers kunnen de pagina op het
oude adres dan niet meer openen en dus hun trainingen niet meer overzetten (ze staan nog in de browser, maar zijn
onbereikbaar). De nieuwe app komt daarom in een **aparte** repository.

## Stappen

Stand 11 oktober 2026, 07:20 UTC: **stap 1–4 en 6 zijn klaar.** Beide adressen draaien 1.3.4 uit dezelfde commit
(`main` 9a601c0): het oude adres met `PROD.open = false` (overzetcode onder Meer, geen verhuismelding, geen
doorverwijzing), https://app.okkiedarts.nl/ in testfase (repo `okkie-app`, certificaat Let's Encrypt t/m 9 januari
2027, Enforce HTTPS aan). Live gecontroleerd: echte update van een bestaand 1.3.3-profiel (gegevens ongewijzigd),
overzetcode oud → nieuw twee keer "Overgezet en gecontroleerd", niets dubbel, oud onveranderd.
DNS: CNAME `app` bij STRATO, DNSSEC actief en geldig (DS 32639 bij .nl). STRATO beantwoordt een vraag naar type
CNAME leeg, maar geeft bij een A-vraag het CNAME plus de GitHub-IP's; dat is voor browsers en GitHub voldoende.
Stap 5 (echte iPhone) is door Martijn bewust na stap 6 gezet; **stap 7 pas na de iPhone-test.**

1. **[Martijn]** Maak op github.com een **lege, openbare** repository `MartijndBesten/okkie-app` (zonder README).
   Claude kan dat niet zelf: de GitHub-koppeling geeft `403 Resource not accessible by integration` bij het aanmaken.
   Staat de Claude GitHub-app op "Only select repositories", voeg `okkie-app` daar toe
   (github.com → Settings → Applications → Claude → Configure).
2. **[Martijn]** STRATO → okkiedarts.nl → DNS → CNAME-record: naam `app`, waarde `martijndbesten.github.io.`
   Niets aan nameservers of DNSSEC veranderen. (De Cloudflare-zone voor okkiedarts.nl staat op "initializing":
   de nameservers zijn nooit omgezet, dus STRATO bepaalt de DNS. Wordt die wissel ooit afgerond, dan moeten
   álle records eerst in Cloudflare staan, ook `app`; anders gaat de site uit de lucht. Claude kan die zone niet
   lezen: de Cloudflare-koppeling heeft geen DNS-rechten.)
3. **[Claude]** `OKKIE_APP_STAGE=test node tools/build-app-site.mjs` en `dist-app/` naar `okkie-app` pushen.
   Testfase: `noindex` en `robots.txt` dicht; verder byte-gelijk aan deze branch.
4. **[Martijn]** `okkie-app` → Settings → Pages: Source *Deploy from a branch*, `main` / root. Custom domain
   `app.okkiedarts.nl` (staat ook in het CNAME-bestand). Na het certificaat: **Enforce HTTPS**.
   Controle door Claude: `node tools/live-check.mjs https://app.okkiedarts.nl/`.
5. **[Martijn, echte iPhone]** Testen zonder het oude adres te veranderen:
   - Oude app (1.3.3) → Meer → **Back-up downloaden** of **Bewaar via Delen** → in Safari op app.okkiedarts.nl
     → Meer → Back-up terugzetten → Samenvoegen. Verslag moet "Overgezet en gecontroleerd" tonen; vergelijk per
     speler aantal trainingen en gemiddelde met de oude app.
   - app.okkiedarts.nl op het beginscherm zetten (Delen → Zet op beginscherm), openen vanaf het beginscherm:
     is hij leeg of niet? (Dit bepaalt of iPhone hier aparte opslag gebruikt.)
   - In Safari: Meer → **Overzetcode maken** → Kopieer → in de app op het beginscherm: Trainingen ophalen → Plakken
     → Controleren → Overzetten. Daarna nog een keer: niets dubbel.
   - Een training starten, halverwege overzetten, in de beginscherm-app afmaken.
   - Installatieadvies bij een nieuwe speler (Eerst proberen / Installeren).
6. **[Claude, na jouw akkoord]** 1.3.4 op `dartlog/main` (oude adres), **nog met `PROD.open = false`**: alleen de
   algemene overzetcode komt erbij onder Meer. Beide adressen draaien dan precies dezelfde versie. Daarna
   `okkie-app` opnieuw bouwen **zonder** testfase. Op de iPhone met je echte gegevens: oude app → Overzetcode →
   nieuwe app. *(Gedaan op 11 oktober; `okkie-app` bewust nog in testfase, zie stap 7.)*
7. **[Claude, na jouw akkoord]** Versie 1.3.5 met de serviceworkerfix (nieuwe versie haalt bestanden rechtstreeks
   van de server, niet uit de browsercache van 10 minuten; test `tests/e2e/update-cache.spec.js`), `okkie-app`
   opnieuw bouwen **zonder** testfase (vindbaar), en `PROD.open = true`: het oude adres toont "OKKIE. verhuist" (geen doorverwijzing).
   Website-knoppen en "Nodig een vriend uit" naar app.okkiedarts.nl. Vanaf hier altijd beide adressen tegelijk
   publiceren uit dezelfde commit; controle: beide `sw.js` noemen dezelfde `okkie-v…`.
8. Het oude adres blijft bestaan als overdrachtspunt. Nooit automatisch doorverwijzen.

Terugdraaien: `PROD.open = false` en opnieuw publiceren. Het oude adres werkt gewoon door; wat al is overgezet blijft
in de nieuwe app staan.
