# OKKIE. — STRATO + Cloudflare: oplever- en publicatieplan

**Domein:** okkiedarts.nl, bij STRATO. Registratie ≠ hosting.
**Broncode:** GitHub MartijndBesten/dartlog.
**Ontwikkeling:** feature/okkie-public-community, PR #1. Opzettelijk nog niet live.
**Bestaande PWA:** https://martijndbesten.github.io/dartlog/ blijft bestaan.

## Gewenste online indeling

- https://okkiedarts.nl/ — publieke introductiewebsite
- https://okkiedarts.nl/app/ — gratis installeerbare PWA voor nieuwe gebruikers
- https://okkiedarts.nl/app/community/ — publieke ranglijst en opt-in account
- https://api.okkiedarts.nl/v1/... — Cloudflare Workers API
- https://beheer.okkiedarts.nl/beheer — privé-eigenaarsoverzicht, Cloudflare Access vereist

De marketingwebsite en PWA krijgen een Cloudflare Pages-project. Cloudflare Pages build:
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

    npx wrangler deploy

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
