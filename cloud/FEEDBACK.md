# Hulp & feedback

In de app: **Meer → Hulp & feedback**. Een gebruiker kiest *probleem* of *idee*, schrijft een bericht en voegt eventueel
een e-mailadres en een schermafbeelding toe. Vóór het versturen ziet hij precies welke technische gegevens meegaan.

## Waar komt een melding terecht?

In de D1-database van de Worker (tabel `feedback`, migratie `0005_feedback.sql`) en in de **besloten inbox**:

```
https://okkie-api.zaalverhuur-sion.workers.dev/v1/feedback/inbox#key=<FEEDBACK_KEY>
```

- `FEEDBACK_KEY` is een Worker-secret (nooit in Git): `npx wrangler secret put FEEDBACK_KEY --env production`.
  Zonder dit secret bestaat de inbox niet (404). Nieuwe sleutel = oude link werkt niet meer.
- De sleutel staat achter `#`: die gaat niet mee naar de server of in logs; de pagina bewaart hem alleen in de sessie.
- In de inbox: lezen, schermafbeelding tonen, afhandelen, verwijderen. Meldingen worden na 180 dagen automatisch gewist
  (dagelijkse cron, `cleanupFeedback`).

## Wat wordt bewaard?

Soort, bericht (max. 2000 tekens), optioneel e-mailadres, optioneel schermafbeelding (in de app verkleind tot max. 1280 px
JPEG, max. ~650 kB), en technische gegevens: appversie, toestel/browser (uit de user-agent), schermgrootte, taal, of de
app geïnstalleerd is en maximaal 5 foutmeldingen van de app uit die sessie (alleen op het toestel bewaard tot iemand iets
instuurt). Onbekende velden worden genegeerd. Geen spelersnamen, trainingen, tokens of codes.

## Spam en misbruik

- Alleen vanaf de app-adressen (Origin-controle en CORS, zoals de rest van de API).
- Verborgen honeypotveld (`website`): ingevuld → antwoord "gelukt", maar niets bewaard.
- Minimale invultijd 2 seconden.
- Per minuut: `RL_REGISTER` (5 per IP). Per dag: max. 10 per adres, via een hash van IP + datum (niet over dagen te koppelen).
- Vaste maximale groottes (verzoek ~760 kB).

## E-mail naar info@denckh.nl

Nog niet actief. De Worker kan pas mailen als er een verzendweg is die niets kost en die wij beheren:

1. **Cloudflare Email Routing + `send_email`-binding** (gratis): vereist dat de Cloudflare-zone okkiedarts.nl actief is
   (nameservers naar Cloudflare; bewust nog niet gedaan, DNSSEC bij STRATO) en dat info@denckh.nl als bestemmingsadres
   bevestigd wordt (klik in de bevestigingsmail). Het huidige API-token heeft ook geen rechten voor Email Routing.
2. **SMTP via de bestaande STRATO-mailbox** (geen nieuwe dienst): Worker verstuurt via `smtp.strato.de:465` met een
   mailboxwachtwoord als secret (`SMTP_USER`, `SMTP_PASS`). Vereist dat Denckh. dat wachtwoord als secret instelt.

Tot die tijd is de inbox de plek om meldingen te lezen. Mailen naar info@denckh.nl blijft daarnaast gewoon mogelijk.
