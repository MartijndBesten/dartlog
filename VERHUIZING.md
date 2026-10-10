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
- **Controle op inhoud, niet alleen aantallen**: vingerafdruk (SHA-256) van alle spelers, trainingen (elke pijl) en
  wedstrijden, plus per speler trainingen, pijlen, punten en gemiddelde. Een afgebroken of veranderde code wordt geweigerd.
- Online profielen (Community/Mijn vrienden), gastkoppelingen en back-upherinneringen gaan mee, maar overschrijven
  nooit iets wat in de nieuwe app al staat.
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

1. **[Martijn]** Maak op GitHub een lege, openbare repository `MartijndBesten/okkie-app` en geef Claude er toegang toe.
2. **[Martijn]** STRATO DNS-beheer voor okkiedarts.nl: voeg een **CNAME**-record toe: naam `app`, waarde
   `martijndbesten.github.io.` Raak nameservers en DNSSEC niet aan.
3. **[Claude]** `node tools/build-app-site.mjs` en de inhoud van `dist-app/` (met `CNAME`) naar `okkie-app` pushen.
4. **[Martijn of Claude]** In `okkie-app` → Settings → Pages: bron `main` / root, Custom domain `app.okkiedarts.nl`,
   wachten op het certificaat, dan **Enforce HTTPS** aanzetten. Controle: `node tools/live-check.mjs https://app.okkiedarts.nl/`.
5. **[Martijn, echte toestellen]** Met `PROD.open` tijdelijk alleen lokaal aan (of met een testkopie):
   - iPhone, oude app op het beginscherm → Overzetcode → nieuwe app op het beginscherm zetten → daar plakken → verslag "Overgezet en gecontroleerd".
   - iPhone in Safari (niet geïnstalleerd) → automatisch overzetten.
   - Android Chrome → automatisch overzetten; daarna installeren via de prompt.
   - Een lopende training overzetten en in de nieuwe app afmaken; nog eens overzetten: niets dubbel.
   - Controleer per speler het aantal trainingen en het gemiddelde in beide apps.
6. **[Claude, na jouw akkoord]** `PROD.open = true`, versie ophogen, publiceren op `dartlog/main`. Het oude adres toont
   dan de kaart "OKKIE. verhuist" (geen doorverwijzing). Website: `APP` in `tools/build-public-site.mjs` en de
   uitnodigingslinks naar `https://app.okkiedarts.nl/` zetten en de site opnieuw publiceren.
7. Het oude adres blijft bestaan als overdrachtspunt. Pas na lange tijd en alleen met een expliciet besluit iets
   wijzigen; nooit automatisch doorverwijzen.

Terugdraaien: `PROD.open = false` en opnieuw publiceren. Het oude adres werkt gewoon door; wat al is overgezet blijft
in de nieuwe app staan.
