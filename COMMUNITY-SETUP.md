# OKKIE. — Website en Community

Status: **op de aparte ontwikkelbranch feature/okkie-public-community. NIET live.**

## Gebouwd
- Introductiepagina op /dartlog/ontdek/ (gratis PWA, zonder App Store).
- Communitypagina op /dartlog/community/ met week-, maand- en totaalranglijst.
- Cloudflare Worker API + D1-schema voor aliasprofielen en beperkte openbare statistieken.
- Herstelcode zonder e-mail en instellingen voor nickname, verbergen en account wissen.
- Automatische synchronisatie na afronden van training, uitsluitend voor aangemelde spelers met toestemming. Zonder internet blijft de lokale training bewaard.
- Bestaande app, URL, trainingshistorie en opslagsleutel ongewijzigd.

## Nog nodig vóór activering
1. Een Cloudflare-account dat de eigenaar zelf autoriseert.
2. D1-database aanmaken en het database-ID invullen in cloud/wrangler.toml.
3. Vanuit de map cloud npm install uitvoeren en eenmalig inloggen met npx wrangler login.
4. npx wrangler d1 create okkie-community; kopieer het database-ID naar wrangler.toml.
5. npx wrangler d1 migrations apply okkie-community --remote.
6. In Cloudflare Turnstile aanmaken voor de relevante domeinen.
7. npx wrangler secret put TURNSTILE_SECRET; voer de geheime sleutel buiten GitHub in.
8. npx wrangler deploy.
9. HTTPS-Worker-URL en publieke Turnstile-sitekey in community/config.js invullen, en ALLOWED_ORIGINS correct instellen.
10. Privacybeleid, beveiliging, echte telefoons en testgebruikers controleren. Pas na akkoord naar main mergen en live zetten.

## Publiek / privé
Publiek, uitsluitend met toestemming: nickname, aantal trainingen, gemiddelde, aantal pijlen, hoogste beurt, 100+/140+/180 en eerste 30-pijlentraining per week. Geen losse pijlen, exacte trainingstijden, volledige geschiedenis, privéwedstrijden of persoonsgegevens zoals e-mail/woonadres.

De eerste volledig afgeronde 30-pijlentraining van de week telt voor de weekchallenge, niet de beste van tien pogingen. Geïmporteerde totaalscores tellen niet mee. Ranglijst is recreatief: eerlijk ingevoerde scores zijn niet te verifiëren.

Accountgeheimen zijn willekeurig en worden op de server gehasht. Behandel de herstelcode als een wachtwoord. Herstellen op een ander toestel trekt de bestaande sessie in. Een gebruiker kan publiek delen uitschakelen en online data wissen.

Een alias met cijfers kan nog steeds onder de AVG als persoonsgegevens gelden. Maak vóór publiek gebruik een passende privacyverklaring, verwerkingsafspraken, bezwaar/verwijderprocedure en bewaartermijn. Voor kinderen jonger dan 16 jaar is de huidige oudercheckbox op zichzelf niet genoeg voor verifieerbare ouderlijke toestemming. Laat de ouderbeheer- en toestemmingsflow eerst goed beoordelen.

Zorg voor Turnstile én passende limieten voor registratie en API-aanroepen. Bewaar geen secrets in GitHub.

## Technische uitbreiding
- API heeft versieprefix /v1; stabiele speler-ID's en losse Cloudflare D1-data.
- Losse entitlements-tabel voorbereid voor later eenmalige Plus-aankoop; er is nu geen betalingsfunctionaliteit actief.
- Clubs, vrienden, challenges, moderatie, betaalde functies en synchronisatie kunnen later als aparte modules worden toegevoegd.
- Statische app en cloud-API kunnen onafhankelijk meegroeien.

## Domein
Verplaats de bestaande PWA niet automatisch naar een nieuw domein. Browseropslag is gekoppeld aan de huidige origin; een verhuizing naar okkiedart.nl draagt data niet zelf over. Gebruik het eigen domein eerst voor de introductiewebsite en verwijs van daar naar de bestaande app. Bouw vóór verhuizing een migratiewizard met back-up/import.

## Testgrenzen
Er zijn unit-tests voor berekeningen en Worker-input toegevoegd en branch-CI ingesteld. Er is nog geen echte Cloudflare D1-instantie gekoppeld, geen productiedeployment uitgevoerd en er is niet getest op een echte iPhone of Android. Browser-end-to-end, anti-spam, herstel op tweede toestel en twintig echte spelers blijven nog te valideren.

## Infrastructuur (branch infra/cloudflare-community)
De technische voorbereiding van okkiedarts.nl, de Worker-omgevingen (staging/productie), rate limiting, het beheer via Cloudflare
Access, de bewaartermijnen en de API-integratietests staat beschreven in **cloud/INFRASTRUCTUUR.md**, inclusief het stappenplan
met wat de eigenaar zelf moet doen (account, nameservers bij STRATO, Turnstile, Access) en wat verder zelfstandig kan.
Belangrijkste waarschuwing daaruit: stel op de GitHub-repository géén custom domain in; de app moet op martijndbesten.github.io blijven.
