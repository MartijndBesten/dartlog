// OKKIE. Darters: iedereen kan het overzicht bekijken (/v1/leaderboard); elke speler zet met één schakelaar zelf
// openbaar delen aan of uit. Geen registratieformulier: een nickname en een leeftijdsgroep (geen geboortedatum).
// - 16+: direct zichtbaar (eigen toestemming).
// - Jonger dan 16: pas zichtbaar en pas cijfers bewaard nadat een ouder/verzorger via een link "ja" zegt (per speler,
//   zonder ouderaccount). Via dezelfde link kan de ouder altijd intrekken: dan verdwijnt het profiel online helemaal.
// - Uitzetten = DELETE /v1/me (bestaande route): profiel en gedeelde cijfers weg; lokale trainingen blijven.
// Staat aan met DARTERS_ENABLED = "true".
export const dartersOpen = env => env.DARTERS_ENABLED === 'true';
const CONSENT_DAYS = 7;

export async function publicConsentOk(env, memberId) {
  return !!(await env.DB.prepare('SELECT 1 AS ok FROM public_consents WHERE member_id = ? AND confirmed_at IS NOT NULL LIMIT 1').bind(memberId).first());
}

async function newConsent(env, h, memberId) {
  const token = h.randomKey();
  // Eén openstaande aanvraag per speler; een gegeven toestemming blijft ongemoeid.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM public_consents WHERE member_id = ? AND confirmed_at IS NULL').bind(memberId),
    env.DB.prepare("INSERT INTO public_consents(id, member_id, token_hash, created_at, expires_at) VALUES(?, ?, ?, datetime('now'), datetime('now', ?))")
      .bind(crypto.randomUUID(), memberId, await h.hash(token), `+${CONSENT_DAYS} days`),
  ]);
  return token;
}

export async function handleDarters(request, env, path, h, cors) {
  if (!path.startsWith('/v1/darters/')) return null;
  if (!dartersOpen(env)) return h.fail('Darters is nog niet beschikbaar.', 404, cors);
  const method = request.method;
  const ipLimited = () => h.limited(env.RL_REGISTER, 'darters:' + h.clientIp(request));

  // Delen aanzetten: een nieuw online profiel voor één lokale speler.
  if (path === '/v1/darters/join' && method === 'POST') {
    if (await ipLimited()) return h.fail('Even rustig aan: probeer het over een minuut opnieuw.', 429, cors);
    const body = await h.bodyJson(request);
    const nickname = h.cleanNickname(body.nickname);
    if (!nickname) return h.fail('Kies een voornaam of bijnaam van 2 tot 24 tekens (geen e-mailadres).', 400, cors);
    if (body.age !== 'adult' && body.age !== 'minor') return h.fail('Kies je leeftijd: 16 of ouder, of jonger dan 16.', 400, cors);
    const adult = body.age === 'adult';
    const id = crypto.randomUUID();
    const handle = id.replaceAll('-', '').slice(0, 12);
    const token = h.randomKey(), recovery = h.randomKey();
    await env.DB.prepare("INSERT INTO members(id,handle,nickname,token_hash,recovery_hash,visible,age_group,consent_at,consent_method,created_at,updated_at) " +
      "VALUES(?,?,?,?,?,?,?,CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END,?,datetime('now'),datetime('now'))")
      .bind(id, handle, nickname, await h.hash(token), await h.hash(recovery), adult ? 1 : 0, body.age, adult ? 'zelf' : null, adult ? 'zelf' : null).run();
    const out = { account: { id, handle, nickname }, token, recovery, public: adult, needsParent: !adult };
    if (!adult) out.consentToken = await newConsent(env, h, id);
    return h.json(out, 201, cors);
  }

  // Nieuwe ouderlink voor een speler jonger dan 16 (bijv. de vorige is verlopen).
  if (path === '/v1/darters/consent/request' && method === 'POST') {
    const member = await h.auth(request, env);
    if (!member) return h.fail('Niet ingelogd.', 401, cors);
    if (member.ageGroup !== 'minor') return h.fail('Alleen nodig voor spelers jonger dan 16.', 400, cors);
    if (await publicConsentOk(env, member.id)) return h.json({ confirmed: true }, 200, cors);
    if (await h.limited(env.RL_WRITE, member.id)) return h.fail('Even rustig aan.', 429, cors);
    return h.json({ consentToken: await newConsent(env, h, member.id) }, 201, cors);
  }

  // Ouder/verzorger, zonder account: bekijken, toestemming geven of intrekken via de link.
  if (path.startsWith('/v1/darters/consent/') && method === 'POST') {
    if (await ipLimited()) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
    const body = await h.bodyJson(request);
    const c = typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) ? await env.DB.prepare(
      "SELECT pc.id, pc.member_id AS memberId, pc.confirmed_at AS confirmedAt, pc.expires_at > datetime('now') AS valid, pc.expires_at AS expiresAt, m.nickname " +
      'FROM public_consents pc JOIN members m ON m.id = pc.member_id WHERE pc.token_hash = ?').bind(await h.hash(body.token)).first() : null;
    // Een gegeven toestemming blijft bruikbaar om in te trekken; een openstaande aanvraag verloopt na 7 dagen.
    if (!c || (!c.confirmedAt && !c.valid)) return h.fail('Deze link is niet (meer) geldig. Je kind kan in OKKIE. een nieuwe maken.', 404, cors);
    if (path === '/v1/darters/consent/preview') {
      return h.json({ child: c.nickname, confirmed: !!c.confirmedAt, expiresAt: c.confirmedAt ? null : String(c.expiresAt).slice(0, 10) }, 200, cors);
    }
    if (path === '/v1/darters/consent/confirm') {
      if (body.parent !== true) return h.fail('Bevestig dat je de ouder of verzorger bent.', 400, cors);
      if (!c.confirmedAt) await env.DB.batch([
        env.DB.prepare("UPDATE public_consents SET confirmed_at = datetime('now') WHERE id = ?").bind(c.id),
        env.DB.prepare("UPDATE members SET visible = 1, consent_at = datetime('now'), consent_method = 'ouderlink', updated_at = datetime('now') WHERE id = ?").bind(c.memberId),
      ]);
      return h.json({ confirmed: true, child: c.nickname }, 200, cors);
    }
    if (path === '/v1/darters/consent/withdraw') {
      // Intrekken: het online profiel en alle gedeelde cijfers verdwijnen meteen (lokale trainingen blijven op de telefoon).
      await env.DB.batch([
        env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(c.memberId),
        env.DB.prepare('DELETE FROM members WHERE id = ?').bind(c.memberId),
      ]);
      return h.json({ withdrawn: true }, 200, cors);
    }
  }
  return h.fail('Onbekende route.', 404, cors);
}
