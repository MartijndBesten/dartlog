// OKKIE. Club: clublogo en eigen clubtrainingen. Wordt alleen aangeroepen vanuit clubs.js NA de controle dat de vrager
// actief lid is van deze club (`me`); elke query filtert daarnaast zelf op club_id. Zie cloud/CLUB.md.
import { amsterdam } from './clubs.js';

export const EXTRA_LIMITS = {
  logoBytes: 200_000,          // na verkleinen in de app (256 × 256); de app weigert vooraf bestanden > 1 MB
  logoPixels: 512,             // PNG: maximale breedte/hoogte (JPEG: de app maakt altijd 256 × 256)
  exercisesActive: 10,         // lopende + komende per club
  maxDays: 56,                 // looptijd van een clubtraining
  nameMax: 40, descriptionMax: 200,
  closeHour: 22,               // einddatum om 22:00 Europe/Amsterdam
};
const ID = /^[a-f0-9]{32}$/;
const HANDLE = /^[a-z0-9]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TARGET = /^(?:[SDT](?:1[0-9]|20|[1-9])|SB|DB)$/;
const TRAINING_ID = /^[A-Za-z0-9_-]{1,64}$/;
const IMPOSSIBLE = new Set([159, 162, 163, 165, 166, 168, 169]);
const KINDS = ['score', 'clock', 'target', 'checkout'];
const newId = () => crypto.randomUUID().replaceAll('-', '');

// ---------- Logo ----------
export function logoType(bytes) {
  const b = bytes;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length > 24 && png.every((v, i) => b[i] === v)) {
    const w = (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h = (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0;
    return w > 0 && h > 0 && w <= EXTRA_LIMITS.logoPixels && h <= EXTRA_LIMITS.logoPixels ? 'image/png' : null;
  }
  return null;
}
async function readImage(request) {
  const declared = Number(request.headers.get('Content-Length') || '0');
  if (declared > EXTRA_LIMITS.logoBytes) return { error: 'Het logo is te groot (max. 200 kB na verkleinen).', status: 413 };
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > EXTRA_LIMITS.logoBytes) return { error: 'Het logo is te groot (max. 200 kB na verkleinen).', status: 413 };
  const type = logoType(buf);
  const said = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!type || said !== type) return { error: 'Alleen een JPG- of PNG-afbeelding is toegestaan.', status: 415 };
  return { buf, type };
}

// ---------- Clubtrainingen: validatie ----------
const clean = (s, max) => typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '';
const validDate = s => DATE.test(s || '') && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
export function exerciseInput(body, today) {
  if (!body || typeof body !== 'object') return { error: 'Ongeldige invoer.' };
  const name = clean(body.name);
  if (!/^[\p{L}\p{N} ._'!&()+,:/-]{2,40}$/u.test(name)) return { error: 'Kies een naam van 2 tot 40 tekens.' };
  const description = clean(body.description);
  if (description.length > EXTRA_LIMITS.descriptionMax || /[<>]/.test(description)) return { error: 'De uitleg is hoogstens 200 tekens, zonder < of >.' };
  if (!KINDS.includes(body.kind)) return { error: 'Kies een type: scoretraining, rond de klok, doel-oefening of checkout-reeks.' };
  const out = { name, description, kind: body.kind, darts: null, target: null, checkouts: null };
  if (body.kind === 'score' || body.kind === 'target') {
    if (!Number.isInteger(body.darts) || body.darts < (body.kind === 'score' ? 9 : 3) || body.darts > 300 || body.darts % 3) return { error: 'Aantal pijlen: een veelvoud van 3, van 9 (doel: 3) tot 300.' };
    out.darts = body.darts;
  }
  if (body.kind === 'target') {
    if (!TARGET.test(body.target || '')) return { error: 'Kies een doelvak, bijv. D16, T20 of DB (bull).' };
    out.target = body.target;
  }
  if (body.kind === 'checkout') {
    const list = Array.isArray(body.checkouts) ? body.checkouts : null;
    if (!list || list.length < 1 || list.length > 10 || !list.every(v => Number.isInteger(v) && v >= 2 && v <= 170 && !IMPOSSIBLE.has(v)))
      return { error: 'Checkout-reeks: 1 tot 10 uitgooibare waarden tussen 2 en 170.' };
    out.checkouts = list;
  }
  if (!validDate(body.startsOn) || !validDate(body.endsOn)) return { error: 'Kies een geldige start- en einddatum.' };
  if (body.endsOn < body.startsOn) return { error: 'De einddatum ligt vóór de startdatum.' };
  if (body.endsOn < today) return { error: 'De einddatum ligt in het verleden.' };
  if (daysBetween(body.startsOn, body.endsOn) >= EXTRA_LIMITS.maxDays) return { error: `Een clubtraining loopt hoogstens ${EXTRA_LIMITS.maxDays} dagen.` };
  out.startsOn = body.startsOn; out.endsOn = body.endsOn;
  return { ok: out };
}
export function exerciseOpen(ex, now) {
  const a = amsterdam(now);
  if (a.date < ex.startsOn || a.date > ex.endsOn) return false;
  return !(a.date === ex.endsOn && a.hour >= EXTRA_LIMITS.closeHour);
}
// Resultaat bij een clubtraining. Score/klok vanuit een echte training (samenvatting); doel/checkout: aantal treffers.
export function resultInput(ex, body) {
  if (!body || typeof body !== 'object') return null;
  const tid = body.trainingId === undefined || body.trainingId === null ? null : body.trainingId;
  if (tid !== null && !(typeof tid === 'string' && TRAINING_ID.test(tid))) return null;
  if (ex.kind === 'score') {
    if (body.darts !== ex.darts || !Number.isInteger(body.points) || body.points < 0 || body.points > ex.darts * 60) return null;
    return { trainingId: tid, darts: ex.darts, points: body.points, hits: null, value: body.points, manual: tid ? 0 : 1 };
  }
  if (ex.kind === 'clock') {
    if (!Number.isInteger(body.darts) || body.darts < 21 || body.darts > 999) return null;
    return { trainingId: tid, darts: body.darts, points: 0, hits: null, value: body.darts, manual: tid ? 0 : 1 };
  }
  const max = ex.kind === 'target' ? ex.darts : ex.checkouts.length;
  if (!Number.isInteger(body.hits) || body.hits < 0 || body.hits > max) return null;
  return { trainingId: tid, darts: ex.kind === 'target' ? ex.darts : 0, points: 0, hits: body.hits, value: body.hits, manual: 1 };
}
const lowerIsBetter = ex => ex.kind === 'clock';
function rowToExercise(r) {
  return { id: r.id, teamId: r.team_id, name: r.name, description: r.description, kind: r.kind, darts: r.darts, target: r.target,
    checkouts: r.checkouts ? JSON.parse(r.checkouts) : null, startsOn: r.starts_on, endsOn: r.ends_on };
}

// ---------- Routes (na de lidmaatschapscontrole in clubs.js) ----------
// ctx: { me (club + rol + teamId van de vrager), member, clubId, now, h, cors }
export async function handleClubExtras(request, env, rest, ctx) {
  const { me, member, clubId, now, h, cors } = ctx;
  const method = request.method;
  const isAdmin = me.role === 'admin';
  const forbidden = (who = 'de beheerder') => h.fail(`Alleen ${who} van de club kan dit.`, 403, cors);

  // Logo: alleen voor leden (via deze route met token), anders een standaardlogo in de app.
  if (rest === '/logo') {
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT mime, data, updated_at AS at FROM club_logos WHERE club_id = ?').bind(clubId).first();
      if (!row) return h.fail('Geen logo.', 404, cors);
      const bytes = row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data);
      return new Response(bytes, { status: 200, headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-site', ...cors } });
    }
    if (method === 'PUT') {
      if (!isAdmin) return forbidden();
      const img = await readImage(request);
      if (img.error) return h.fail(img.error, img.status, cors);
      await env.DB.prepare(
        "INSERT INTO club_logos(club_id, mime, data, bytes, updated_by, updated_at) VALUES(?,?,?,?,?,datetime('now')) " +
        'ON CONFLICT(club_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, bytes = excluded.bytes, updated_by = excluded.updated_by, updated_at = excluded.updated_at'
      ).bind(clubId, img.type, img.buf, img.buf.length, member.id).run();
      return h.json({ logo: true, bytes: img.buf.length }, 200, cors);
    }
    if (method === 'DELETE') {
      if (!isAdmin) return forbidden();
      await env.DB.prepare('DELETE FROM club_logos WHERE club_id = ?').bind(clubId).run();
      return h.json({ logo: false }, 200, cors);
    }
  }

  if (!rest.startsWith('/exercises')) return null;
  const captainOf = async teamId => !!teamId && !!(await env.DB.prepare('SELECT 1 AS ok FROM club_teams WHERE id = ? AND club_id = ? AND captain_id = ?').bind(teamId, clubId, member.id).first());
  // Zichtbaar: clubbreed, of een team waar je in zit / captain van bent; beheerders zien alles.
  const visible = async ex => !ex.team_id || isAdmin || me.teamId === ex.team_id || await captainOf(ex.team_id);
  const today = amsterdam(now).date;

  if (rest === '/exercises' && method === 'GET') {
    const rows = (await env.DB.prepare(
      "SELECT e.*, t.name AS team_name FROM club_exercises e LEFT JOIN club_teams t ON t.id = e.team_id WHERE e.club_id = ? AND e.ends_on >= date(?, '-14 days') ORDER BY e.starts_on, e.name"
    ).bind(clubId, today).all()).results || [];
    const mine = new Map(((await env.DB.prepare('SELECT exercise_id AS id, value FROM club_exercise_results WHERE club_id = ? AND member_id = ?').bind(clubId, member.id).all()).results || []).map(r => [r.id, r.value]));
    const out = [];
    for (const r of rows) if (await visible(r)) out.push({ ...rowToExercise(r), teamName: r.team_name, open: exerciseOpen(rowToExercise(r), now), mine: mine.get(r.id) ?? null,
      canSubmit: !r.team_id || me.teamId === r.team_id, canManage: isAdmin || await captainOf(r.team_id) });
    return h.json({ exercises: out, canCreate: { club: isAdmin, teams: isAdmin ? 'all' : (((await env.DB.prepare('SELECT id FROM club_teams WHERE club_id = ? AND captain_id = ?').bind(clubId, member.id).all()).results) || []).map(t => t.id) } }, 200, cors);
  }
  if (rest === '/exercises' && method === 'POST') {
    const body = await h.bodyJson(request);
    const teamId = body.teamId ?? null;
    if (teamId !== null && !ID.test(teamId)) return h.fail('Team niet gevonden.', 404, cors);
    if (teamId !== null && !(await env.DB.prepare('SELECT 1 AS ok FROM club_teams WHERE id = ? AND club_id = ?').bind(teamId, clubId).first())) return h.fail('Team niet gevonden.', 404, cors);
    if (!isAdmin && !(teamId && await captainOf(teamId))) return forbidden(teamId ? 'de beheerder of de captain van dit team' : 'de beheerder');
    const v = exerciseInput(body, today);
    if (v.error) return h.fail(v.error, 400, cors);
    const active = (await env.DB.prepare('SELECT COUNT(*) AS n FROM club_exercises WHERE club_id = ? AND ends_on >= ?').bind(clubId, today).first()).n;
    if (active >= EXTRA_LIMITS.exercisesActive) return h.fail(`Er lopen al ${EXTRA_LIMITS.exercisesActive} clubtrainingen; verwijder er eerst één.`, 409, cors);
    const e = v.ok, id = newId();
    await env.DB.prepare(
      "INSERT INTO club_exercises(id, club_id, team_id, name, description, kind, darts, target, checkouts, starts_on, ends_on, created_by, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))"
    ).bind(id, clubId, teamId, e.name, e.description, e.kind, e.darts, e.target, e.checkouts ? JSON.stringify(e.checkouts) : null, e.startsOn, e.endsOn, member.id).run();
    return h.json({ exercise: { id, teamId, ...e } }, 201, cors);
  }
  const m = rest.match(/^\/exercises\/([a-f0-9]{32})(\/.*)?$/);
  if (!m) return h.fail('Onbekende route.', 404, cors);
  const row = await env.DB.prepare('SELECT * FROM club_exercises WHERE id = ? AND club_id = ?').bind(m[1], clubId).first();
  if (!row || !await visible(row)) return h.fail('Clubtraining niet gevonden.', 404, cors);
  const ex = rowToExercise(row), sub = m[2] || '';
  const canManage = isAdmin || await captainOf(row.team_id);

  if (sub === '' && method === 'GET') {
    const results = (await env.DB.prepare(
      'SELECT m.id, m.handle, m.nickname, r.darts, r.points, r.hits, r.value, r.manual, r.submitted_at AS at FROM club_exercise_results r ' +
      "JOIN club_members cm ON cm.club_id = r.club_id AND cm.member_id = r.member_id AND cm.status = 'active' JOIN members m ON m.id = r.member_id " +
      `WHERE r.club_id = ? AND r.exercise_id = ? ORDER BY r.value ${lowerIsBetter(ex) ? 'ASC' : 'DESC'}, r.submitted_at ASC, m.handle ASC`
    ).bind(clubId, ex.id).all()).results || [];
    return h.json({ exercise: { ...ex, open: exerciseOpen(ex, now), canSubmit: !row.team_id || me.teamId === row.team_id, canManage },
      ranking: results.map((r, i) => ({ rank: i + 1, handle: r.handle, nickname: r.nickname, you: r.id === member.id, darts: r.darts, points: r.points, hits: r.hits, value: r.value, manual: !!r.manual,
        average: ex.kind === 'score' ? Math.round(r.points / r.darts * 300) / 100 : null })) }, 200, cors);
  }
  if (sub === '' && method === 'DELETE') {
    if (!canManage) return forbidden('de beheerder of de captain van dit team');
    await env.DB.prepare('DELETE FROM club_exercises WHERE id = ? AND club_id = ?').bind(ex.id, clubId).run();
    return h.json({ deleted: true }, 200, cors);
  }
  if (sub === '/results' && method === 'POST') {
    if (row.team_id && me.teamId !== row.team_id) return h.fail('Deze clubtraining is voor een ander team.', 403, cors);
    if (!exerciseOpen(ex, now)) return h.fail(today < ex.startsOn ? 'Deze clubtraining is nog niet begonnen.' : 'Deze clubtraining is gesloten.', 409, cors);
    const r = resultInput(ex, await h.bodyJson(request));
    if (!r) return h.fail('Dit resultaat past niet bij deze clubtraining.', 400, cors);
    const old = await env.DB.prepare('SELECT value FROM club_exercise_results WHERE exercise_id = ? AND member_id = ?').bind(ex.id, member.id).first();
    const isBetter = !old || (lowerIsBetter(ex) ? r.value < old.value : r.value > old.value);
    if (isBetter) await env.DB.prepare(
      "INSERT INTO club_exercise_results(exercise_id, club_id, member_id, training_id, darts, points, hits, value, manual, submitted_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now')) " +
      'ON CONFLICT(exercise_id, member_id) DO UPDATE SET training_id = excluded.training_id, darts = excluded.darts, points = excluded.points, hits = excluded.hits, ' +
      'value = excluded.value, manual = excluded.manual, submitted_at = excluded.submitted_at'
    ).bind(ex.id, clubId, member.id, r.trainingId, r.darts, r.points, r.hits, r.value, r.manual).run();
    return h.json({ best: isBetter, value: isBetter ? r.value : old.value }, 201, cors);
  }
  const target = sub.match(/^\/results\/([a-z0-9]{12})$/)?.[1];
  if (target && method === 'DELETE') {
    if (target !== member.handle && !canManage) return forbidden('de beheerder of de captain van dit team');
    if (!HANDLE.test(target)) return h.fail('Resultaat niet gevonden.', 404, cors);
    const res = await env.DB.prepare('DELETE FROM club_exercise_results WHERE exercise_id = ? AND club_id = ? AND member_id = (SELECT id FROM members WHERE handle = ?)').bind(ex.id, clubId, target).run();
    if (!res.meta?.changes) return h.fail('Resultaat niet gevonden.', 404, cors);
    return h.json({ removed: target }, 200, cors);
  }
  return h.fail('Onbekende route.', 404, cors);
}
