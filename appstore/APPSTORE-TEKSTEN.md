# OKKIE. in de App Store — teksten en instellingen

Alles om in App Store Connect over te nemen (Mijn apps → OKKIE. → App Store / App-informatie).
Taal: **Nederlands** (primaire taal). Lengtes zijn gecontroleerd met `node tools/ios/check-appstore-texts.mjs`.

## App-informatie

| Veld | Waarde |
|---|---|
| Naam (max. 30) | `OKKIE. Darttrainer` |
| Ondertitel (max. 30) | `Gooi. Scoor. Word beter.` |
| Bundle-ID | `nl.denckh.okkie` |
| SKU | `okkie` (zo aangemaakt in App Store Connect) |
| Primaire categorie | Sport |
| Secundaire categorie | leeg |
| Inhoudsrechten | Geen inhoud van derden |
| Copyright | `2026 Denckh.` |
| Prijs | Gratis, alle 175 landen, ook nieuwe landen; geen in-app-aankopen |
| Privacybeleid-URL | https://okkiedarts.nl/privacy/ |
| Support-URL | https://okkiedarts.nl/contact/ |
| Marketing-URL | https://app.okkiedarts.nl/ |

> Waarom niet alleen "OKKIE."? Een naam in de App Store moet uniek zijn en een korte naam zonder omschrijving
> is lastiger te vinden. Op het beginscherm staat gewoon **OKKIE.** (CFBundleDisplayName).
> Is "OKKIE. Darttrainer" bezet, kies dan "OKKIE. darts".

## Promotietekst (max. 170, mag je altijd aanpassen zonder nieuwe versie)

```
Train je darts, oefen gericht op je dubbels en je uitgooi, en speel mee in je eigen besloten club. Gratis, zonder reclame, zonder account en zonder aankopen.
```

## Beschrijving (max. 4000)

```
OKKIE. is je persoonlijke darttrainer. Gooi drie pijlen, tik ze in en zie meteen of je beter wordt. Voor beginners, kinderen én fanatieke darters.

TRAINEN
• Scoretraining van 30, 60 of 99 pijlen, vrij trainen of een eigen aantal beurten
• Grote knoppen: DOUBLE, TRIPLE, 1–20, 25, BULL en MIS, of typ je worp (T20 5 D10)
• Rond de klok: 1 tot en met 20 en de bull, ook alleen dubbels of alleen triples
• Gericht oefenen: Bob's 27 voor je dubbels en 121 Checkout voor je uitgooi, met record en weektrend
• Vandaag oefenen: een voorstel op basis van je eigen cijfers, altijd met de getallen erbij
• Weekdoel: kies zelf hoe vaak per week je wilt trainen
• Persoonlijk doel net boven je eigen niveau

SAMEN SPELEN
• Samen trainen met maximaal 8 spelers die om de beurt gooien, met ranglijst
• Wedstrijd 301 of 501 voor 1 tot 4 spelers, double-out of straight-out, met uitgooi-advies
• Iedere speler houdt zijn eigen statistieken

OKKIE. CLUB
• Richt gratis een besloten club op voor je dartvereniging of team, of word lid met een uitnodiging
• Een beheerder laat nieuwe leden toe; alleen clubgenoten zien de club
• Wekelijkse clubuitdaging met ranglijst en clubrecord, ook met Bob's 27 en 121 Checkout
• Voor spelers van 16 jaar en ouder; alleen samengevatte resultaten gaan naar de server

ZIEN DAT JE BETER WORDT
• Gemiddelde per 3 pijlen, beste en slechtste training, 100+, 140+ en 180
• Grafiek per training, dag, week of maand met trendlijn
• Trefferkaart: op welk vak van het bord je het vaakst raakt
• Records en 39 badges, met een feestje bij je eerste 180
• Gesproken aanmoedigingen als je dat wilt

JOUW GEGEVENS BLIJVEN VAN JOU
• Geen account nodig, geen reclame, geen aankopen in de app
• Alles staat op je eigen iPhone en werkt ook zonder internet
• Back-up bewaren in Bestanden of iCloud Drive, en overzetten van Safari naar de app met een overzetcode
• Wil je je cijfers laten zien aan andere darters? Dat kan in Darters, per speler en alleen als je dat zelf aanzet

Gebruikte je OKKIE. al in Safari of op je beginscherm? Open dan in de oude OKKIE. Meer → Overzetcode maken, en kies in de app Trainingen ophalen. Er wordt niets gewist.

OKKIE. is ontwikkeld door Denckh. in Nederland.
```

## Trefwoorden (max. 100, komma's zonder spaties)

```
darts,dart,trainer,training,501,301,dartbord,score,checkout,gemiddelde,oefenen,180,club,uitgooien
```

## Wat is nieuw (versie 1.8.0)

```
De eerste versie van OKKIE. als iPhone-app. Alles werkt zonder internet, en je trainingen uit Safari of je beginscherm haal je mee met een overzetcode.
```

## Leeftijdsclassificatie (vragenlijst)

Alles **Nee/Geen**, behalve:

| Vraag | Antwoord | Waarom |
|---|---|---|
| Door gebruikers gegenereerde inhoud / gebruikers kunnen met elkaar communiceren | **Ja, gebruikersinhoud**: alleen bijnamen in Darters. Geen chat of berichten. | Darters toont bijnamen; melden en verbergen is ingebouwd. |
| Onbeperkte toegang tot het web | Nee | Externe links openen in Safari. |
| Wedstrijden/gokken/loot boxes | Nee | Geen prijzen of geld. |
| Ouderlijk toezicht / leeftijdsgarantie | Nee | Delen onder 16 staat dicht (MINORS_OPEN = false). |

Ingevuld via de API op 1 november 2026 (gebruikersinhoud Ja, sociale media Nee, chat Nee, reclame Nee, ouderlijk
toezicht Nee, leeftijdsverificatie Nee, onbeperkt web Nee, al het andere Geen). Apple berekende **4+**.
Vooraf verwacht: 9+ of 13+ door de gebruikersinhoud. **Niet** in de categorie Kinderen plaatsen (die vereist
o.a. geen externe links en geen netwerkverkeer zonder ouderlijke poort).

## Notities voor de review (App Review Information)

Contactgegevens staan alleen in App Store Connect (niet in de repo). Inloggegevens: **niet nodig** ("Inloggen vereist" uit).

```
OKKIE. is a darts training app (Dutch). No account or login is needed; all training data is stored on the device and the app works fully offline (all web assets are bundled in the app, no remote content).

How to test: enter a name, tap "Trainen" and "Start scoretraining", then tap three darts (e.g. TRIPLE + 20). Statistics, the hit map (Stats tab), 301/501 matches (Wedstrijd tab) and backups (Meer > Back-up bewaren in Bestanden, via the share sheet) are all native-local.

Optional online feature "Darters": a public leaderboard of nicknames and summary stats that each player can opt into per player (16+ only). Users can hide any darter on their device and report a profile by e-mail from the profile view (Darters > tap a name). Reported profiles are reviewed and removed by the developer. "Hulp & feedback" sends a support message to our own server.

No ads, no in-app purchases, no tracking. Native features used: haptics, share sheet (save to Files), local file storage for data durability, status bar.
```

## Engels (en-US)

Naam `OKKIE. Darts Trainer`, ondertitel `Throw. Score. Get better.`, beschrijving vertaald met bovenaan *Please note:
the app is in Dutch.* Promotietekst en trefwoorden in het Engels. Zelfde URL's. De Engelse vermelding gebruikt de
Nederlandse screenshots. Staat in App Store Connect (ingevuld via de API, 1 november 2026).

## Exportnaleving

`ITSAppUsesNonExemptEncryption = false` staat in Info.plist: alleen standaard-HTTPS. App Store Connect vraagt het dan
niet meer bij elke build.

## Screenshots

Uit de echte app in de simulator (fictieve demogegevens Sem en Papa, geen netwerk): Actions → OKKIE iPhone-app →
Run workflow → vinkje *screenshots* → artefact `appstore-screenshots` met `6.9/` (1320 × 2868) en `6.5/`.
Code: `tools/ios/appstore-shots.sh`, `ios/App/OKKIEUITests/AppStoreScreenshots.swift`, gegevens
`tools/ios/appstore-demo-data.mjs`. Oudere browserversie (alleen 6,9"): `appstore/screenshots/6.9/`, zie hieronder.
`appstore/screenshots/6.9/` (1320 × 2868, iPhone 6,9"): Home, Training, Uitslag, Statistieken, Trefferkaart, 501.
Opnieuw maken: `PW_EXECUTABLE=… node tools/ios/appstore-screenshots.mjs`. Alleen iPhone (geen iPad), dus geen
iPad-screenshots nodig. Kleinere iPhone-formaten maakt App Store Connect zelf uit 6,9".

## Versie 1.9.0 (klaar; indienen pas na goedkeuring van 1.8.0)

Wat is nieuw (nl):

```
Nieuw: OKKIE. Club. Richt gratis een besloten club op voor je dartvereniging of team, of word lid met een uitnodiging. De club maakt zijn eigen clubtrainingen, elk met een ranglijst die alleen clubgenoten zien, en kiest een clubnaam en logo. Iedereen gooit wanneer het uitkomt.
```

Wat is nieuw (en):

```
New: OKKIE. Club. Start a private club for your darts association or team for free, or join with an invite. The club creates its own club trainings, each with a ranking only club members can see, and sets a club name and logo. Everyone throws when it suits them.
```

Reviewnotitie, aanvulling voor 1.9.0:

```
New in 1.9.0: "OKKIE. Club" (Meer/Home > OKKIE. Club). A private space per darts club: users 16+ create a club or request to join with an invite code; a club admin approves members. Content (club name, logo, club training names) is visible only to members of that club. Users can report a club name, logo, training or member by e-mail (Leden tab) and hide members on their device; we review reports and can remove names, logos, trainings or whole clubs. To test: Home > OKKIE. Club > "Gratis een club oprichten", enter a club name and confirm.
```

App Privacy, aanpassen voor 1.9.0 (in App Store Connect, door Martijn of de browser-assistent):
- **Foto's of video's:** "gekoppeld aan identiteit" wordt **Ja**. Een clublogo uploadt een beheerder vanuit zijn
  profiel; het is alleen zichtbaar voor clubleden.
- **Overige gebruikersinhoud** (nieuw): naam en uitleg van clubtrainingen die een beheerder of captain maakt.
  Appfunctionaliteit, gekoppeld Ja, tracking Nee.
- **Gameplay-inhoud** en **Naam** blijven zoals ze zijn (gekoppeld Ja). Daaronder vallen nu ook de clubresultaten en
  het lidmaatschap.

## Versie 1.10.0 (volgt op 1.8.0; 1.9.0 wordt overgeslagen)

Build: TestFlight-build uit dartlog `main` (workflow *OKKIE iPhone-app*, TestFlight + App Store). Bevat alles uit
1.9.0 (OKKIE. Club) plus de trainingsfuncties van webversie 1.10.0. Build 31 (1.9.0) wordt niet ingediend.

Wat is nieuw (nl):

```
Nieuw in deze versie:
• OKKIE. Club: richt gratis een besloten club op voor je dartvereniging of team, of word lid met een uitnodiging. Met een wekelijkse clubuitdaging, ranglijst en clubrecord die alleen clubgenoten zien.
• Gericht oefenen: Bob's 27 voor je dubbels, 121 Checkout voor je uitgooi en Rond de klok met alleen dubbels of triples. Per oefening je record en een lijn per week.
• Vandaag oefenen: een voorstel op basis van je eigen cijfers, altijd met de getallen erbij.
• Weekdoel in plaats van een dagteller.
• Een eerdere beurt aanpassen, en in 301/501 desgewenst per beurt het totaal invoeren.
```

Wat is nieuw (en):

```
New in this version:
• OKKIE. Club: start a private club for your darts association or team for free, or join with an invite. With a weekly club challenge, ranking and club record visible only to club members.
• Targeted practice: Bob's 27 for your doubles, 121 Checkout for your finishing and Around the clock with doubles or trebles only. A record and a weekly trend line per drill.
• Practice today: a suggestion based on your own numbers, always showing the figures behind it.
• A weekly goal instead of a daily streak counter.
• Edit an earlier turn, and optionally enter a turn total in 301/501.
```

Reviewnotitie 1.10.0 (vervangt de 1.9.0-aanvulling, onder de tekst van 1.8.0):

```
New in 1.10.0: (1) "OKKIE. Club" (Home > OKKIE. Club). A private space per darts club: users 16+ create a club or request to join with an invite code; a club admin approves members. Content (club name, logo, club training names, results) is visible only to members of that club. Users can report a club name, logo, training or member by e-mail (Leden tab) and hide members on their device; we review reports and can remove names, logos, trainings or whole clubs. To test: Home > OKKIE. Club > "Gratis een club oprichten", enter a club name and confirm. (2) Targeted practice drills (Trainen > Gericht oefenen) and a "Vandaag oefenen" suggestion card on Home; these work fully offline and store data only on the device. Only a drill's final score is sent if the user shares it with their club.
```

App Privacy voor 1.10.0: dezelfde aanpassingen als hierboven bij 1.9.0 (Foto's of video's gekoppeld Ja; Overige
gebruikersinhoud nieuw; Gameplay-inhoud en Naam ongewijzigd). 1.10.0 verzamelt daarnaast niets nieuws: van een
oefening gaat alleen de eindscore naar de club als de gebruiker die deelt (valt onder Gameplay-inhoud).

Leeftijdsclassificatie: ongewijzigd (gebruikersinhoud Ja; Club voegt clubnamen, logo's en trainingsnamen toe, met
melden en verbergen). Privacybeleid https://okkiedarts.nl/privacy/ dekt Club (6a) en de oefenresultaten.

## Versie 1.11.0 (build 66; ingediend na goedkeuring van 1.10.0 op 7 november 2026)

Build: nog niet gemaakt. Na afronding van de review van 1.10.0: TestFlight-build uit dartlog `main` (workflow *OKKIE
iPhone-app*), testen in TestFlight, daarna pas versie 1.11.0 aanmaken en indienen (`appstore/release-1.11.0.json`).
Inhoud gelijk aan webapp 1.11.0: OKKIE. Club bij het bord.

Wat is nieuw (nl):

```
Nieuw in deze versie:
• OKKIE. Club bij het bord: de beheerder print een clubposter met QR-code (A4 of A5) en hangt hem bij het dartbord. Scannen, je naam kiezen en meteen meespelen voor je club.
• Persoonlijke uitnodiging: een link voor één speler, die één keer werkt.
• Kies zelf of je trainingen automatisch meetellen voor je club. Dat staat standaard uit.
```

Wat is nieuw (en):

```
New in this version:
• OKKIE. Club at the board: the club admin prints a club poster with a QR code (A4 or A5) for next to the dartboard. Scan, pick your name and play for your club straight away.
• Personal invite: a link for one player that works once.
• Choose whether your trainings count for your club automatically. This is off by default.
```

Reviewnotitie 1.11.0 (aanvulling op die van 1.10.0): zie `reviewNotes` in `appstore/release-1.11.0.json`.

App Privacy: ongewijzigd (zelfde gegevenssoorten; een optionele omschrijving bij een toegangscode valt onder Overige
gebruikersinhoud). Leeftijdsclassificatie: ongewijzigd (16+ voor Club blijft server-side afgedwongen).
