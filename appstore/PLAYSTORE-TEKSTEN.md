# OKKIE. in Google Play — teksten en formulieren (VOORBEREID, niet ingediend)

Bron voor de Play Console (Store-vermelding, Gegevensveiligheid, Contentclassificatie, Doelgroep). Inhoud gelijk aan
de App Store (`APPSTORE-TEKSTEN.md`), aangepast voor Android (geen iPhone, Safari of iCloud). Niets hiervan is
ingevuld in een Play Console: er is nog geen ontwikkelaarsaccount (zie `ANDROID-APP.md`).

## Store-vermelding (nl-NL, standaardtaal)

App-naam (max. 30): `OKKIE. Darttrainer`

Korte beschrijving (max. 80):

```
Train je darts, zie of je beter wordt en speel mee met je club. Gratis, geen reclame.
```

Volledige beschrijving (max. 4000):

```
OKKIE. is je persoonlijke darttrainer. Gooi drie pijlen, tik ze in en zie meteen of je beter wordt. Voor beginners, kinderen én fanatieke darters.

TRAINEN
• Scoretraining van 30, 60 of 99 pijlen, vrij trainen of een eigen aantal beurten
• Grote knoppen: DOUBLE, TRIPLE, 1–20, 25, BULL en MIS, of typ je worp (T20 5 D10)
• Rond de klok: 1 tot en met 20 en de bull, ook alleen dubbels of alleen triples
• Gericht oefenen: Bob's 27 voor je dubbels en 121 Checkout voor je uitgooi, met record en weektrend
• Vandaag oefenen: een voorstel op basis van je eigen cijfers, altijd met de getallen erbij
• Weekdoel: kies zelf hoe vaak per week je wilt trainen

SAMEN SPELEN
• Samen trainen met maximaal 8 spelers die om de beurt gooien, met ranglijst
• Wedstrijd 301 of 501 voor 1 tot 4 spelers, double-out of straight-out, met uitgooi-advies
• Iedere speler houdt zijn eigen statistieken

OKKIE. CLUB
• Richt gratis een besloten club op voor je dartvereniging, kantine of team
• Hang de clubposter met QR-code bij het dartbord: scannen, je naam kiezen en meespelen
• De beheerder laat nieuwe leden toe of kiest voor direct meedoen; alleen clubgenoten zien de club
• Wekelijkse clubuitdaging met ranglijst en clubrecord
• Jij kiest wat je deelt: per training, of automatisch (staat standaard uit)
• Voor spelers van 16 jaar en ouder; alleen samengevatte resultaten gaan naar de server

ZIEN DAT JE BETER WORDT
• Gemiddelde per 3 pijlen, beste en slechtste training, 100+, 140+ en 180
• Grafiek per training, dag, week of maand met trendlijn
• Trefferkaart: op welk vak van het bord je het vaakst raakt
• Records en 39 badges, met een feestje bij je eerste 180

JOUW GEGEVENS BLIJVEN VAN JOU
• Geen account nodig, geen reclame, geen aankopen in de app
• Alles staat op je eigen telefoon en werkt ook zonder internet
• Back-up bewaren of delen (bijvoorbeeld in Google Drive), en overzetten vanuit Chrome naar de app met een overzetcode
• Wil je je cijfers laten zien aan andere darters? Dat kan in Darters, per speler en alleen als je dat zelf aanzet

Gebruikte je OKKIE. al in Chrome of op je beginscherm? Open dan daar Meer → Overzetcode maken, en kies in de app Trainingen ophalen. Er wordt niets gewist.

OKKIE. is ontwikkeld door Denckh. in Nederland.
```

Engels (en-US): korte beschrijving `Train your darts, see yourself improve and play for your club. Free, no ads.`; volledige
beschrijving = de Engelse App Store-tekst (`appstore/release-1.10.0.json`, `en-US.description`) met dezelfde Android-
aanpassingen (geen iPhone/Safari/iCloud; "Please note: the app is in Dutch." bovenaan laten staan).

Categorie: **Sport**. Tags: Darts, Training. Contact: info@denckh.nl, website https://okkiedarts.nl/,
privacybeleid https://okkiedarts.nl/privacy/.

Afbeeldingen: app-icoon 512 × 512 (`icons/icon-512.png`, zonder transparantie aanleveren), feature graphic 1024 × 500
(nog maken), minimaal 2 telefoonscreenshots (de iPhone-screenshots 6.5" zijn bruikbaar; liever echte Android-screenshots
uit de emulator-rooktest).

## Gegevensveiligheid (Data safety)

Antwoorden, gelijk aan de App Privacy-labels bij Apple:

| Vraag | Antwoord |
|---|---|
| Verzamelt of deelt de app gegevens? | **Ja, verzameld; niet gedeeld met derden** (Cloudflare is verwerker, geen "delen") |
| Versleuteld onderweg? | Ja (alleen HTTPS) |
| Kan de gebruiker vragen gegevens te verwijderen? | Ja: in de app (Darters/Club: profiel verwijderen, club verlaten) en per mail info@denckh.nl |
| Naam | Ja (bijnaam bij Darters/Club), optioneel, appfunctionaliteit |
| Foto's | Ja (clublogo, alleen beheerders), optioneel, appfunctionaliteit |
| App-activiteit: overige door gebruikers gemaakte inhoud | Ja (clubnaam, clubtrainingen, omschrijving bij een toegangscode), optioneel, appfunctionaliteit |
| App-activiteit: in-app-zoekgeschiedenis / overige acties | Nee |
| Gamegegevens / overige app-prestaties | Ja: samengevatte trainingscijfers (Darters/Club), optioneel, appfunctionaliteit |
| E-mailadres | Ja (alleen als je het zelf invult bij Hulp & feedback), optioneel, klantenservice |
| Diagnostiek / crashlogs | Ja: technische gegevens bij Hulp & feedback (appversie, toestel, laatste foutmeldingen), optioneel |
| Apparaat- of andere ID's | Nee (de profielcode is een willekeurige code, geen apparaat-ID) |
| Locatie, contacten, financieel, gezondheid, berichten, audio | Nee |
| Analyse | Anonieme dagteller zonder ID (usage-ping): niet persoonsgebonden; volgens Google's definitie niet "verzameld" omdat er geen gebruikersgegevens in zitten — **bij twijfel als "App-interacties, analyse" opgeven** |

URL voor accountverwijdering (verplicht als je een account kunt maken): https://okkiedarts.nl/privacy/#rechten (staat
uitgelegd: in de app zelf verwijderen of mailen). Controleer bij het invullen of Google een aparte pagina eist.

## Contentclassificatie (IARC-vragenlijst)

Categorie: *Overig / Hulpprogramma's, productiviteit, communicatie of overig* (geen game). Geen geweld, seks, grof
taalgebruik, drugs of gokken (darten zonder inzet). **Interactie tussen gebruikers: ja** (Darters: bijnamen en
cijfers zichtbaar; Club: clubnamen, logo's, trainingen); geen chat, geen delen van locatie, geen aankopen. Verwacht
resultaat: PEGI 3 / alle leeftijden met de aanduiding "Gebruikers hebben interactie" — gelijk aan 4+ bij Apple.

## Doelgroep en inhoud (beslissing Martijn)

Advies: leeftijdsgroepen **13–15, 16–17 en 18+**; kinderen niet als doelgroep aanvinken. Reden: kies je ook onder 13,
dan geldt het Families-beleid (extra controle van alle SDK's, ouderlijke toestemming, presentatie). OKKIE. voldoet daar
waarschijnlijk aan (geen reclame, geen tracking, Darters onder 16 alleen met ouderlijke toestemming, Club 16+), maar
het is een extra beoordelingstraject. Kinderen mogen de app gewoon gebruiken; het gaat alleen om de doelgroep in Play.
Bij Apple is gekozen voor 4+ zonder Kids-categorie; dit is daarmee in lijn.

## Overige verklaringen

Advertenties: **nee**. Overheidsapp: nee. Financiële functies: nee. Gezondheid: nee. Nieuws: nee. COVID: nee.
Toegang voor de review: **geen inloggegevens nodig** (alles werkt zonder account; Club testen kan door zelf een club
op te richten).
