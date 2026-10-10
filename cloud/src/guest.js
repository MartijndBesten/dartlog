// OKKIE. Spelen op een andere telefoon, met behoud van je eigen statistieken.
// - Je eigen telefoon maakt een koppelcode (8 tekens, 7 dagen geldig, alleen gehasht bewaard).
// - De telefoon van een vriend stuurt met die code precies één training (alleen de samenvatting) naar jouw inbox.
//   De code geeft geen inzage in je profiel en kan niets anders wijzigen. Opnieuw versturen van dezelfde training
//   (bijv. na een netwerkfout of offline spelen) is onschuldig: er komt nooit een dubbele.
// - Je eigen telefoon haalt de inbox op, voegt de training lokaal toe en bevestigt; dan wordt hij online gewist.
//   Zo blijft je eigen telefoon de enige plek waar jouw cijfers samenkomen (geen dubbele tellingen).
// Staat aan/uit met Mijn vrienden (GROUPS_ENABLED).
import { groupsOpen, minorMayStore } from './groups.js';

export const GUEST_LIMITS = { passDays: 7, openPasses: 5, inboxDays: 60, maxTrainingAgeDays: 60 };
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // zonder 0/O, 1/I/L
export const normalizeCode = c => typeof c === 'string' ? c.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join('');
}
const pretty = c => c.slice(0, 4) + '-' + c.slice(4);

// Alleen de samenvatting van één scoretraining; alles moet onderling kloppen.
export function trainingOkay(t) {
  if (!t || typeof t !== 'object') return false;
  const int = v => Number.isSafeInteger(v) && v >= 0;
  if (typeof t.id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(t.id)) return false;
  if (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return false;
  const day = Date.parse(t.date + 'T00:00:00Z');
  if (!Number.isFinite(day) || day > Date.now() + 86400000 || day < Date.now() - GUEST_LIMITS.maxTrainingAgeDays * 86400000) return false;
  if (!int(t.darts) || t.darts < 3 || t.darts > 999 || t.darts % 3 !== 0 || !int(t.points) || t.points > t.darts * 60) return false;
  const turns = Math.ceil(t.darts / 3);
  if (!(t.high === null || (int(t.high) && t.high <= 180 && t.high <= t.points))) return false;
  if (![t.tons, t.t140, t.t180].every(int) || t.t180 > t.t140 || t.t140 > t.tons || t.tons > turns) return false;
  if ((t.tons > 0 && !(t.high >= 100)) || (t.t140 > 0 && !(t.high >= 140)) || (t.t180 > 0 && t.high !== 180)) return false;
  return true;
}

export async function handleGuest(request, env, path, h, cors, member) {
  const own = path === '/v1/me/guest-pass' || path.startsWith('/v1/me/inbox');
  if (!own && !path.startsWith('/v1/guest/')) return null;
  if (!groupsOpen(env)) return h.fail('Spelen op een andere telefoon is nog niet beschikbaar.', 404, cors);
  const method = request.method;

  if (own) {
    if (!member) return h.fail('Niet ingelogd; herstel je profiel met de herstelcode.', 401, cors);
    // Koppelcode maken. Alleen wie online statistieken mag hebben (jonger dan 16: met toestemming voor een groep).
    if (path === '/v1/me/guest-pass' && method === 'POST') {
      const allowed = member.ageGroup === 'adult' || member.consentMethod === 'dienst' || await minorMayStore(env, member.id);
      if (!allowed) return h.json({ needsParent: true, error: 'Dit kan pas als je ouder toestemming heeft gegeven voor een vriendengroep.' }, 403, cors);
      const open = (await env.DB.prepare("SELECT COUNT(*) AS n FROM guest_passes WHERE member_id = ? AND used_at IS NULL AND expires_at > datetime('now')").bind(member.id).first()).n;
      if (open >= GUEST_LIMITS.openPasses) return h.fail('Je hebt al een paar ongebruikte codes. Gebruik die eerst, of wacht tot ze verlopen.', 409, cors);
      const code = newCode();
      await env.DB.prepare("INSERT INTO guest_passes(id, member_id, code_hash, created_at, expires_at) VALUES(?,?,?,datetime('now'),datetime('now', ?))")
        .bind(crypto.randomUUID().replaceAll('-', ''), member.id, await h.hash(code), `+${GUEST_LIMITS.passDays} days`).run();
      return h.json({ code: pretty(code), days: GUEST_LIMITS.passDays }, 201, cors);
    }
    if (path === '/v1/me/inbox' && method === 'GET') {
      const rows = await env.DB.prepare(
        'SELECT training_id AS id, played_on AS date, darts, points, high, tons, t140, t180 FROM guest_inbox WHERE member_id = ? ORDER BY received_at LIMIT 100'
      ).bind(member.id).all();
      return h.json({ trainings: rows.results || [] }, 200, cors);
    }
    if (path === '/v1/me/inbox/ack' && method === 'POST') {
      const body = await h.bodyJson(request);
      const ids = Array.isArray(body.ids) ? body.ids.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 100) : [];
      for (const id of ids) await env.DB.prepare('DELETE FROM guest_inbox WHERE member_id = ? AND training_id = ?').bind(member.id, id).run();
      return h.json({ removed: ids.length }, 200, cors);
    }
    return h.fail('Onbekende route.', 404, cors);
  }

  if (method !== 'POST') return h.fail('Niet toegestaan.', 405, cors);
  if (await h.limited(env.RL_REGISTER, 'guest:' + h.clientIp(request))) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
  const body = await h.bodyJson(request);
  const code = normalizeCode(body.code);
  if (code.length !== 8) return h.fail('Deze koppelcode klopt niet. Vraag een nieuwe.', 404, cors);
  const pass = await env.DB.prepare(
    "SELECT p.id, p.member_id AS memberId, p.used_at AS usedAt, p.used_training_id AS usedFor, p.expires_at > datetime('now') AS valid, m.nickname " +
    'FROM guest_passes p JOIN members m ON m.id = p.member_id WHERE p.code_hash = ?'
  ).bind(await h.hash(code)).first();
  const gone = () => h.fail('Deze koppelcode is niet (meer) geldig. Vraag een nieuwe.', 404, cors);

  // Wie hoort bij deze code? Alleen de voornaam, zodat de vriend de juiste speler toevoegt.
  if (path === '/v1/guest/preview') {
    if (!pass || pass.usedAt || !pass.valid) return gone();
    return h.json({ nickname: pass.nickname }, 200, cors);
  }
  if (path === '/v1/guest/training') {
    const t = body.training;
    if (!trainingOkay(t)) return h.fail('Deze training kan niet worden toegevoegd (onvolledige of onmogelijke gegevens).', 400, cors);
    if (!pass) return gone();
    // Dezelfde training nog eens (netwerkfout, offline opnieuw versturen): al ontvangen, geen dubbele.
    if (pass.usedAt) return pass.usedFor === t.id ? h.json({ received: true, already: true, nickname: pass.nickname }, 200, cors) : gone();
    if (!pass.valid) return gone();
    const claimed = await env.DB.prepare("UPDATE guest_passes SET used_at = datetime('now'), used_training_id = ? WHERE id = ? AND used_at IS NULL").bind(t.id, pass.id).run();
    if (!claimed.meta?.changes) return gone();
    await env.DB.prepare(
      'INSERT INTO guest_inbox(member_id, training_id, played_on, darts, points, high, tons, t140, t180, received_at) ' +
      "VALUES(?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(member_id, training_id) DO NOTHING"
    ).bind(pass.memberId, t.id, t.date, t.darts, t.points, t.high, t.tons, t.t140, t.t180).run();
    return h.json({ received: true, nickname: pass.nickname }, 201, cors);
  }
  return h.fail('Onbekende route.', 404, cors);
}
