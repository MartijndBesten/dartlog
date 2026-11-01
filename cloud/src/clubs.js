// OKKIE. Club (proef): besloten clubs per vereniging. Alle toegangscontrole gebeurt hier, server-side. Zie cloud/CLUB.md.
// - Een club bestaat alleen voor haar ACTIEVE leden. Voor iedereen anders (ook een lid dat nog wacht op goedkeuring,
//   een verwijderd lid of een lid van een andere club) bestaat ze niet: 404, ook bij een geldig club-ID.
// - Elke query op clubgegevens filtert op club_id ÉN op een actief lidmaatschap van de vrager in die club.
// - Een uitnodigingscode geeft alleen een aanvraag; een beheerder keurt goed. Bekijken van een code toont alleen naam
//   en ledenaantal.
// - Rollen: beheerder (alles), captain (teamoverzicht van het eigen team), lid.
// - Alleen 16+ in deze eerste versie (members.age_group = 'adult').
// - Staat standaard UIT: CLUBS_ENABLED moet exact "true" zijn. Een club aanmaken kan daarnaast alleen met een
//   Iedereen van 16+ mag een club oprichten, met misbruiklimieten (CLUB_LIMITS: nieuwe clubs per speler per 30 dagen,
//   clubs als beheerder, nieuwe clubs per dag voor heel OKKIE., openstaande aanmeldingen per speler, plus IP-limiet).
import { weekKey } from './groups.js';
import { handleClubExtras } from './club-extras.js';

export const CLUB_LIMITS = {
  clubsPerMember: 5,
  membersPerClub: 150,
  pendingPerClub: 50,
  teamsPerClub: 20,
  feedDays: 60,
  feedItems: 50,
  formWeeks: 4,
  closeDay: 7, closeHour: 22,   // zondag 22:00 Europe/Amsterdam
  createdPer30Days: 2,          // nieuwe clubs per speler per 30 dagen
  adminClubs: 3,                // clubs waar je beheerder van bent
  newClubsPerDay: 100,          // nieuwe clubs per dag (UTC) voor heel OKKIE.: noodrem tegen massaal aanmaken
  pendingPerMember: 3,          // openstaande aanmeldingen per speler
};
export const clubsOpen = env => env.CLUBS_ENABLED === 'true';
export const CLUB_ADULTS_ONLY = 'OKKIE. Club is voorlopig alleen voor spelers van 16 jaar en ouder.';
export const CHALLENGE_KINDS = { score30: 30, score60: 60, score99: 99, clock: null };
const FEED_KINDS = ['score30', 'score60', 'score99', 'free', 'clock'];
const ID = /^[a-f0-9]{32}$/;
const HANDLE = /^[a-z0-9]{12}$/;
const TRAINING_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // geen 0/O, 1/I/L
const CODE = /^[A-HJKMNP-Z2-9]{8}$/;
const newId = () => crypto.randomUUID().replaceAll('-', '');

export function cleanClubName(input) {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
  return /^[\p{L}\p{N} ._'!&()+-]{2,40}$/u.test(name) ? name : null;
}
export function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export const normalizeCode = input => typeof input === 'string' ? input.trim().toUpperCase().replace(/[\s-]/g, '') : '';

// ---------- Tijd: week van maandag t/m zondag, Europe/Amsterdam (zomer- en wintertijd via Intl) ----------
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export function amsterdam(now = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: WD[p.weekday], hour: Number(p.hour), minute: Number(p.minute) };
}
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Maandag van de clubweek waarin `now` valt (lokale tijd Amsterdam).
export function clubWeek(now = new Date(), offsetWeeks = 0) {
  const a = amsterdam(now);
  return addDays(a.date, -(a.weekday - 1) + offsetWeeks * 7);
}
// Is de ranglijst van deze week nog open? Alleen de lopende week, tot zondag 22:00.
export function weekOpen(week, now = new Date()) {
  if (week !== clubWeek(now)) return false;
  const a = amsterdam(now);
  return !(a.weekday === CLUB_LIMITS.closeDay && a.hour >= CLUB_LIMITS.closeHour);
}
export const closesAt = week => `${addDays(week, 6)} ${String(CLUB_LIMITS.closeHour).padStart(2, '0')}:00`;

// Validatie van één training (alleen samenvatting) per soort.
export function trainingOkay(t, kinds = FEED_KINDS) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.trainingId !== 'string' || !TRAINING_ID.test(t.trainingId) || !kinds.includes(t.kind)) return false;
  if (![t.darts, t.points].every(v => Number.isSafeInteger(v) && v >= 0)) return false;
  if (t.high !== undefined && t.high !== null && !(Number.isSafeInteger(t.high) && t.high >= 0 && t.high <= 180)) return false;
  const fixed = CHALLENGE_KINDS[t.kind];
  if (fixed) return t.darts === fixed && t.points <= fixed * 60;
  if (t.kind === 'clock') return t.darts >= 21 && t.darts <= 999 && t.points === 0;
  return t.darts >= 3 && t.darts <= 3000 && t.darts % 3 === 0 && t.points <= t.darts * 60;   // vrij trainen
}
const resultValue = t => t.kind === 'clock' ? t.darts : t.points;
const better = (kind, a, b) => kind === 'clock' ? a < b : a > b;

// ---------- Lidmaatschap ----------
async function activeMembership(env, clubId, memberId) {
  if (!ID.test(clubId || '')) return null;
  return env.DB.prepare(
    "SELECT c.id, c.name, c.invite_code AS inviteCode, c.max_members AS maxMembers, cm.role, cm.team_id AS teamId " +
    "FROM clubs c JOIN club_members cm ON cm.club_id = c.id WHERE c.id = ? AND cm.member_id = ? AND cm.status = 'active'"
  ).bind(clubId, memberId).first();
}
async function clubByCode(env, code) {
  const c = normalizeCode(code);
  if (!CODE.test(c)) return null;
  return env.DB.prepare('SELECT id, name, max_members AS maxMembers FROM clubs WHERE invite_code = ?').bind(c).first();
}
export async function clubCodeValid(env, code) {
  return clubsOpen(env) && !!(await clubByCode(env, code));
}
const countActive = async (env, clubId) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND status = 'active'").bind(clubId).first()).n;
const countMine = async (env, memberId) => (await env.DB.prepare('SELECT COUNT(*) AS n FROM club_members WHERE member_id = ?').bind(memberId).first()).n;

// Alle gegevens van één lid in één club wissen (verlaten, verwijderd door beheerder, aanvraag afgewezen).
async function wipeFromClub(env, clubId, memberId) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM club_results WHERE club_id = ? AND member_id = ?').bind(clubId, memberId),
    env.DB.prepare('DELETE FROM club_feed WHERE club_id = ? AND member_id = ?').bind(clubId, memberId),
    env.DB.prepare('DELETE FROM club_exercise_results WHERE club_id = ? AND member_id = ?').bind(clubId, memberId),
    env.DB.prepare('UPDATE club_teams SET captain_id = NULL WHERE club_id = ? AND captain_id = ?').bind(clubId, memberId),
    env.DB.prepare('DELETE FROM club_members WHERE club_id = ? AND member_id = ?').bind(clubId, memberId),
  ]);
}
// Laatste beheerder weg: beheer naar een ander actief lid (captain eerst, dan langst lid); niemand meer → club weg.
async function ensureAdmin(env, clubId) {
  const admin = await env.DB.prepare("SELECT 1 AS ok FROM club_members WHERE club_id = ? AND role = 'admin' AND status = 'active' LIMIT 1").bind(clubId).first();
  if (admin) return;
  const next = await env.DB.prepare(
    "SELECT member_id AS id FROM club_members WHERE club_id = ? AND status = 'active' " +
    "ORDER BY CASE role WHEN 'captain' THEN 0 ELSE 1 END, joined_at, rowid LIMIT 1"
  ).bind(clubId).first();
  if (next) await env.DB.prepare("UPDATE club_members SET role = 'admin' WHERE club_id = ? AND member_id = ?").bind(clubId, next.id).run();
  else await env.DB.prepare('DELETE FROM clubs WHERE id = ?').bind(clubId).run();
}
async function leaveClub(env, clubId, memberId) {
  await wipeFromClub(env, clubId, memberId);
  await ensureAdmin(env, clubId);
}
// Bij verwijderen van een account (zelf, beheer of opschoning): uit alle clubs, beheer doorgeven.
export async function releaseClubMemberships(env, memberId) {
  const rows = await env.DB.prepare('SELECT club_id AS id FROM club_members WHERE member_id = ?').bind(memberId).all();
  for (const r of rows.results || []) await leaveClub(env, r.id, memberId);
}
// Dagelijkse opschoning: oude feedberichten.
export async function cleanupClubs(env) {
  await env.DB.prepare('DELETE FROM club_feed WHERE created_at < datetime(\'now\', ?)').bind(`-${CLUB_LIMITS.feedDays} days`).run();
}

// ---------- Overzichten (altijd met club_id én alleen actieve leden) ----------
async function clubMembers(env, clubId, viewerId) {
  const rows = await env.DB.prepare(
    "SELECT m.id, m.handle, m.nickname, cm.role, cm.team_id AS teamId, cm.joined_at AS joinedAt FROM club_members cm " +
    "JOIN members m ON m.id = cm.member_id WHERE cm.club_id = ? AND cm.status = 'active' ORDER BY m.nickname COLLATE NOCASE, m.handle"
  ).bind(clubId).all();
  return (rows.results || []).map(r => ({ handle: r.handle, nickname: r.nickname, role: r.role, teamId: r.teamId, you: r.id === viewerId, joinedAt: (r.joinedAt || '').slice(0, 10) }));
}
// Vormranglijst: gemiddelde per 3 pijlen over de laatste 4 weken (weekcijfers die de app synchroniseert), min. 30 pijlen.
async function formRanking(env, clubId, viewerId, now, teamId = null) {
  const oldest = weekKey(now, CLUB_LIMITS.formWeeks - 1);
  const rows = await env.DB.prepare(
    "SELECT m.id, m.handle, m.nickname, cm.team_id AS teamId, COALESCE(SUM(s.darts),0) AS darts, COALESCE(SUM(s.points),0) AS points, " +
    "COALESCE(SUM(s.sessions),0) AS sessions FROM club_members cm JOIN members m ON m.id = cm.member_id " +
    "LEFT JOIN stats s ON s.member_id = cm.member_id AND s.period LIKE 'week:%' AND s.period >= ? " +
    "WHERE cm.club_id = ? AND cm.status = 'active' AND (? IS NULL OR cm.team_id = ?) GROUP BY m.id"
  ).bind(oldest, clubId, teamId, teamId).all();
  return (rows.results || []).map(r => ({ handle: r.handle, nickname: r.nickname, teamId: r.teamId, you: r.id === viewerId, darts: r.darts, sessions: r.sessions,
    average: r.darts >= 30 ? Math.round(r.points / r.darts * 300) / 100 : null }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || b.sessions - a.sessions || a.handle.localeCompare(b.handle));
}
async function challengeOf(env, clubId, week) {
  return env.DB.prepare('SELECT id, week, kind FROM club_challenges WHERE club_id = ? AND week = ?').bind(clubId, week).first();
}
async function challengeRanking(env, clubId, challenge, viewerId) {
  const asc = challenge.kind === 'clock';
  const rows = await env.DB.prepare(
    "SELECT m.id, m.handle, m.nickname, r.darts, r.points, r.high, r.value, r.submitted_at AS submittedAt FROM club_results r " +
    "JOIN club_members cm ON cm.club_id = r.club_id AND cm.member_id = r.member_id AND cm.status = 'active' " +
    "JOIN members m ON m.id = r.member_id WHERE r.club_id = ? AND r.challenge_id = ? " +
    `ORDER BY r.value ${asc ? 'ASC' : 'DESC'}, r.submitted_at ASC, m.handle ASC`
  ).bind(clubId, challenge.id).all();
  return (rows.results || []).map((r, i) => ({ rank: i + 1, handle: r.handle, nickname: r.nickname, you: r.id === viewerId, darts: r.darts, points: r.points,
    high: r.high, value: r.value, average: challenge.kind === 'clock' ? null : Math.round(r.points / r.darts * 300) / 100 }));
}
async function challengeView(env, clubId, week, viewerId, now) {
  const c = await challengeOf(env, clubId, week);
  if (!c) return { week, challenge: null };
  return { week, challenge: { kind: c.kind, darts: CHALLENGE_KINDS[c.kind], open: weekOpen(week, now), closesAt: closesAt(week) },
    ranking: await challengeRanking(env, clubId, c, viewerId) };
}

// ---------- Routes: /v1/clubs* ----------
export async function handleClubs(request, env, path, h, cors) {
  if (!path.startsWith('/v1/clubs')) return null;
  if (!clubsOpen(env)) return h.fail('OKKIE. Club is nog niet beschikbaar.', 404, cors);
  const method = request.method;
  // Alleen voor tests (vaste tijd); in wrangler.toml nooit gezet (zie tests/omgevingen.test.js).
  const now = env.CLUB_TEST_NOW ? new Date(env.CLUB_TEST_NOW) : new Date();
  const ipLimited = () => h.limited(env.RL_REGISTER, 'club:' + h.clientIp(request));
  const notFound = () => h.fail('Club niet gevonden.', 404, cors);

  // Code bekijken: alleen naam en aantal leden, geen gegevens van leden. Geen account nodig.
  if (path === '/v1/clubs/preview' && method === 'POST') {
    if (await ipLimited()) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
    const club = await clubByCode(env, (await h.bodyJson(request)).code);
    if (!club) return h.fail('Deze clubcode klopt niet. Vraag de beheerder van je club om de code.', 404, cors);
    return h.json({ club: { name: club.name, members: await countActive(env, club.id) } }, 200, cors);
  }

  const member = await h.auth(request, env);
  if (!member) return h.fail('Niet ingelogd; maak eerst je OKKIE.-profiel aan of herstel het.', 401, cors);
  if (method !== 'GET' && await h.limited(env.RL_WRITE, member.id)) return h.fail('Te veel wijzigingen achter elkaar. Probeer het zo opnieuw.', 429, cors);
  const adult = member.ageGroup === 'adult';

  // Mijn clubs (ook openstaande aanvragen, zonder clubgegevens behalve de naam).
  if (path === '/v1/clubs' && method === 'GET') {
    const rows = await env.DB.prepare(
      "SELECT c.id, c.name, cm.role, cm.status, (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id AND x.status = 'active') AS members " +
      'FROM club_members cm JOIN clubs c ON c.id = cm.club_id WHERE cm.member_id = ? ORDER BY c.name'
    ).bind(member.id).all();
    return h.json({ clubs: (rows.results || []).map(r => r.status === 'active' ? r : { id: r.id, name: r.name, status: r.status }),
      me: { adult }, limits: CLUB_LIMITS }, 200, cors);
  }
  // Club aanmaken: iedereen van 16+, binnen de misbruiklimieten; de maker wordt beheerder.
  if (path === '/v1/clubs' && method === 'POST') {
    if (!adult) return h.fail(CLUB_ADULTS_ONLY, 403, cors);
    const body = await h.bodyJson(request);
    const name = cleanClubName(body.name);
    if (!name) return h.fail('Kies een clubnaam van 2 tot 40 tekens.', 400, cors);
    if (body.consent !== true) return h.fail('Bevestig wat je met de club deelt.', 400, cors);
    if (await countMine(env, member.id) >= CLUB_LIMITS.clubsPerMember) return h.fail(`Je zit al in ${CLUB_LIMITS.clubsPerMember} clubs.`, 409, cors);
    if (await ipLimited()) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
    const recent = (await env.DB.prepare("SELECT COUNT(*) AS n FROM clubs WHERE created_by = ? AND created_at >= datetime('now', '-30 days')").bind(member.id).first()).n;
    if (recent >= CLUB_LIMITS.createdPer30Days) return h.fail(`Je hebt de afgelopen 30 dagen al ${CLUB_LIMITS.createdPer30Days} clubs opgericht. Probeer het later opnieuw.`, 429, cors);
    const admins = (await env.DB.prepare("SELECT COUNT(*) AS n FROM club_members WHERE member_id = ? AND role = 'admin'").bind(member.id).first()).n;
    if (admins >= CLUB_LIMITS.adminClubs) return h.fail(`Je bent al beheerder van ${CLUB_LIMITS.adminClubs} clubs.`, 409, cors);
    const today = (await env.DB.prepare("SELECT COUNT(*) AS n FROM clubs WHERE created_at >= date('now')").first()).n;
    if (today >= CLUB_LIMITS.newClubsPerDay) return h.fail('Er zijn vandaag erg veel clubs opgericht. Probeer het morgen opnieuw.', 429, cors);
    const id = newId();
    let code = newInviteCode();
    while (await clubByCode(env, code)) code = newInviteCode();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO clubs(id, name, invite_code, max_members, created_by, created_at, updated_at) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))")
        .bind(id, name, code, CLUB_LIMITS.membersPerClub, member.id),
      env.DB.prepare("INSERT INTO club_members(club_id, member_id, role, status, requested_at, joined_at) VALUES(?,?,'admin','active',datetime('now'),datetime('now'))")
        .bind(id, member.id),
    ]);
    return h.json({ club: { id, name, role: 'admin', inviteCode: code } }, 201, cors);
  }
  // Lid worden met de code: aanvraag, de beheerder keurt goed.
  if (path === '/v1/clubs/join' && method === 'POST') {
    if (!adult) return h.fail(CLUB_ADULTS_ONLY, 403, cors);
    if (await ipLimited()) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
    const body = await h.bodyJson(request);
    if (body.consent !== true) return h.fail('Bevestig wat je met de club deelt.', 400, cors);
    const club = await clubByCode(env, body.code);
    if (!club) return h.fail('Deze clubcode klopt niet. Vraag de beheerder van je club om de code.', 404, cors);
    const existing = await env.DB.prepare('SELECT status FROM club_members WHERE club_id = ? AND member_id = ?').bind(club.id, member.id).first();
    if (existing) return h.json({ club: { name: club.name }, status: existing.status, already: true }, 200, cors);
    const myPending = (await env.DB.prepare("SELECT COUNT(*) AS n FROM club_members WHERE member_id = ? AND status = 'pending'").bind(member.id).first()).n;
    if (myPending >= CLUB_LIMITS.pendingPerMember) return h.fail(`Je hebt al ${CLUB_LIMITS.pendingPerMember} aanmeldingen open staan. Wacht tot een beheerder ze bekijkt.`, 429, cors);
    if (await countMine(env, member.id) >= CLUB_LIMITS.clubsPerMember) return h.fail(`Je zit al in ${CLUB_LIMITS.clubsPerMember} clubs.`, 409, cors);
    const pending = (await env.DB.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND status = 'pending'").bind(club.id).first()).n;
    if (pending >= CLUB_LIMITS.pendingPerClub) return h.fail('Er staan al veel aanvragen open bij deze club. Probeer het later opnieuw.', 409, cors);
    if (await countActive(env, club.id) >= club.maxMembers) return h.fail('Deze club is vol.', 409, cors);
    await env.DB.prepare("INSERT INTO club_members(club_id, member_id, role, status, requested_at) VALUES(?,?,'member','pending',datetime('now'))").bind(club.id, member.id).run();
    return h.json({ club: { name: club.name }, status: 'pending' }, 201, cors);
  }

  const m = path.match(/^\/v1\/clubs\/([^/]+)(\/.*)?$/);
  if (!m) return h.fail('Onbekende route.', 404, cors);
  const [, clubId, rest = ''] = m;
  // Eigen openstaande aanvraag intrekken: het enige wat een niet-actief lid met een club kan.
  if (rest === '/me' && method === 'DELETE') {
    const row = ID.test(clubId) ? await env.DB.prepare('SELECT status FROM club_members WHERE club_id = ? AND member_id = ?').bind(clubId, member.id).first() : null;
    if (!row) return notFound();
    await leaveClub(env, clubId, member.id);
    return h.json({ left: true, deleted: ['lidmaatschap', 'weekresultaten', 'feed'] }, 200, cors);
  }
  const me = await activeMembership(env, clubId, member.id);
  if (!me) return notFound();
  const isAdmin = me.role === 'admin';
  const forbidden = (who = 'de beheerder') => h.fail(`Alleen ${who} van de club kan dit.`, 403, cors);
  // Clublogo en eigen clubtrainingen (club-extras.js), pas na de lidmaatschapscontrole hierboven.
  const extra = await handleClubExtras(request, env, rest, { me, member, clubId, now, h, cors });
  if (extra) return extra;

  if (rest === '' && method === 'GET') {
    const teams = (await env.DB.prepare(
      'SELECT t.id, t.name, mc.handle AS captain FROM club_teams t LEFT JOIN members mc ON mc.id = t.captain_id WHERE t.club_id = ? ORDER BY t.name'
    ).bind(clubId).all()).results || [];
    const pending = isAdmin ? (await env.DB.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND status = 'pending'").bind(clubId).first()).n : undefined;
    const logo = await env.DB.prepare('SELECT updated_at AS at FROM club_logos WHERE club_id = ?').bind(clubId).first();
    return h.json({ club: { id: clubId, name: me.name, role: me.role, teamId: me.teamId, maxMembers: me.maxMembers, logo: logo ? logo.at : null, ...(isAdmin ? { inviteCode: me.inviteCode, pending } : {}) },
      members: await clubMembers(env, clubId, member.id), teams, thisWeek: await challengeView(env, clubId, clubWeek(now), member.id, now) }, 200, cors);
  }
  if (rest === '' && method === 'PATCH') {
    if (!isAdmin) return forbidden();
    const name = cleanClubName((await h.bodyJson(request)).name);
    if (!name) return h.fail('Kies een clubnaam van 2 tot 40 tekens.', 400, cors);
    await env.DB.prepare("UPDATE clubs SET name = ?, updated_at = datetime('now') WHERE id = ?").bind(name, clubId).run();
    return h.json({ club: { id: clubId, name } }, 200, cors);
  }
  if (rest === '' && method === 'DELETE') {
    if (!isAdmin) return forbidden();
    await env.DB.prepare('DELETE FROM clubs WHERE id = ?').bind(clubId).run();   // cascade: leden, teams, oefeningen, resultaten, feed
    return h.json({ deleted: true }, 200, cors);
  }
  // Uitnodigingscode vernieuwen (oude code werkt direct niet meer).
  if (rest === '/code' && method === 'POST') {
    if (!isAdmin) return forbidden();
    let code = newInviteCode();
    while (await clubByCode(env, code)) code = newInviteCode();
    await env.DB.prepare("UPDATE clubs SET invite_code = ?, updated_at = datetime('now') WHERE id = ?").bind(code, clubId).run();
    return h.json({ inviteCode: code }, 200, cors);
  }
  // Aanvragen.
  if (rest === '/requests' && method === 'GET') {
    if (!isAdmin) return forbidden();
    const rows = await env.DB.prepare(
      "SELECT m.handle, m.nickname, cm.requested_at AS requestedAt FROM club_members cm JOIN members m ON m.id = cm.member_id " +
      "WHERE cm.club_id = ? AND cm.status = 'pending' ORDER BY cm.requested_at"
    ).bind(clubId).all();
    return h.json({ requests: (rows.results || []).map(r => ({ ...r, requestedAt: r.requestedAt.slice(0, 10) })) }, 200, cors);
  }
  const reqHandle = rest.match(/^\/requests\/([a-z0-9]{12})$/)?.[1];
  if (reqHandle && method === 'POST') {
    if (!isAdmin) return forbidden();
    const body = await h.bodyJson(request);
    if (typeof body.approve !== 'boolean') return h.fail('Kies goedkeuren of afwijzen.', 400, cors);
    const row = await env.DB.prepare(
      "SELECT cm.member_id AS id FROM club_members cm JOIN members m ON m.id = cm.member_id WHERE cm.club_id = ? AND m.handle = ? AND cm.status = 'pending'"
    ).bind(clubId, reqHandle).first();
    if (!row) return h.fail('Aanvraag niet gevonden.', 404, cors);
    if (!body.approve) { await wipeFromClub(env, clubId, row.id); return h.json({ handle: reqHandle, approved: false }, 200, cors); }
    if (await countActive(env, clubId) >= me.maxMembers) return h.fail('De club is vol.', 409, cors);
    await env.DB.prepare("UPDATE club_members SET status = 'active', joined_at = datetime('now') WHERE club_id = ? AND member_id = ? AND status = 'pending'").bind(clubId, row.id).run();
    return h.json({ handle: reqHandle, approved: true }, 200, cors);
  }
  // Leden beheren: rol en team wijzigen, verwijderen (met al zijn gegevens in deze club).
  const target = rest.match(/^\/members\/([a-z0-9]{12})$/)?.[1];
  if (target && (method === 'PATCH' || method === 'DELETE')) {
    if (!isAdmin) return forbidden();
    const row = await env.DB.prepare(
      "SELECT cm.member_id AS id, cm.role FROM club_members cm JOIN members m ON m.id = cm.member_id WHERE cm.club_id = ? AND m.handle = ? AND cm.status = 'active'"
    ).bind(clubId, target).first();
    if (!row) return h.fail('Lid niet gevonden.', 404, cors);
    if (method === 'DELETE') {
      if (row.id === member.id) return h.fail('Verlaat de club via "Club verlaten".', 400, cors);
      await leaveClub(env, clubId, row.id);
      return h.json({ removed: target }, 200, cors);
    }
    const body = await h.bodyJson(request);
    if (body.role !== undefined) {
      if (!['admin', 'captain', 'member'].includes(body.role)) return h.fail('Ongeldige rol.', 400, cors);
      if (row.role === 'admin' && body.role !== 'admin') {
        const admins = (await env.DB.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND role = 'admin' AND status = 'active'").bind(clubId).first()).n;
        if (admins <= 1) return h.fail('Een club heeft minstens één beheerder. Maak eerst iemand anders beheerder.', 409, cors);
      }
      await env.DB.prepare('UPDATE club_members SET role = ? WHERE club_id = ? AND member_id = ?').bind(body.role, clubId, row.id).run();
      if (body.role === 'member') await env.DB.prepare('UPDATE club_teams SET captain_id = NULL WHERE club_id = ? AND captain_id = ?').bind(clubId, row.id).run();
    }
    if (body.teamId !== undefined) {
      if (body.teamId !== null && !(ID.test(body.teamId) && await env.DB.prepare('SELECT 1 AS ok FROM club_teams WHERE id = ? AND club_id = ?').bind(body.teamId, clubId).first()))
        return h.fail('Team niet gevonden.', 404, cors);
      await env.DB.prepare('UPDATE club_members SET team_id = ? WHERE club_id = ? AND member_id = ?').bind(body.teamId, clubId, row.id).run();
    }
    return h.json({ handle: target, updated: true }, 200, cors);
  }
  // Teams.
  if (rest === '/teams' && method === 'POST') {
    if (!isAdmin) return forbidden();
    const body = await h.bodyJson(request);
    const name = cleanClubName(body.name);
    if (!name) return h.fail('Kies een teamnaam van 2 tot 40 tekens.', 400, cors);
    const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM club_teams WHERE club_id = ?').bind(clubId).first()).n;
    if (n >= CLUB_LIMITS.teamsPerClub) return h.fail(`Een club heeft hoogstens ${CLUB_LIMITS.teamsPerClub} teams.`, 409, cors);
    const id = newId();
    await env.DB.prepare("INSERT INTO club_teams(id, club_id, name, created_at) VALUES(?,?,?,datetime('now'))").bind(id, clubId, name).run();
    return h.json({ team: { id, name } }, 201, cors);
  }
  const teamM = rest.match(/^\/teams\/([a-f0-9]{32})$/);
  if (teamM) {
    const team = await env.DB.prepare('SELECT t.id, t.name, t.captain_id AS captainId FROM club_teams t WHERE t.id = ? AND t.club_id = ?').bind(teamM[1], clubId).first();
    if (!team) return h.fail('Team niet gevonden.', 404, cors);
    // Captain-overzicht: alleen de captain van dít team en beheerders.
    if (method === 'GET') {
      if (!isAdmin && team.captainId !== member.id) return forbidden('de captain van dit team of de beheerder');
      const week = await challengeView(env, clubId, clubWeek(now), member.id, now);
      const byHandle = new Map((week.ranking || []).map(r => [r.handle, r]));
      const form = await formRanking(env, clubId, member.id, now, team.id);
      return h.json({ team: { id: team.id, name: team.name }, weeks: CLUB_LIMITS.formWeeks, challenge: week.challenge,
        players: form.map(p => ({ ...p, thisWeek: byHandle.get(p.handle) ? { value: byHandle.get(p.handle).value, rank: byHandle.get(p.handle).rank } : null })) }, 200, cors);
    }
    if (!isAdmin) return forbidden();
    if (method === 'PATCH') {
      const body = await h.bodyJson(request);
      const name = body.name === undefined ? team.name : cleanClubName(body.name);
      if (!name) return h.fail('Kies een teamnaam van 2 tot 40 tekens.', 400, cors);
      let captainId = team.captainId;
      if (body.captain !== undefined) {
        if (body.captain === null) captainId = null;
        else {
          const c = HANDLE.test(body.captain || '') ? await env.DB.prepare(
            "SELECT cm.member_id AS id, cm.role FROM club_members cm JOIN members m ON m.id = cm.member_id WHERE cm.club_id = ? AND m.handle = ? AND cm.status = 'active'"
          ).bind(clubId, body.captain).first() : null;
          if (!c) return h.fail('Lid niet gevonden.', 404, cors);
          captainId = c.id;
          if (c.role === 'member') await env.DB.prepare("UPDATE club_members SET role = 'captain' WHERE club_id = ? AND member_id = ?").bind(clubId, c.id).run();
        }
      }
      await env.DB.prepare('UPDATE club_teams SET name = ?, captain_id = ? WHERE id = ? AND club_id = ?').bind(name, captainId, team.id, clubId).run();
      return h.json({ team: { id: team.id, name } }, 200, cors);
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM club_teams WHERE id = ? AND club_id = ?').bind(team.id, clubId).run();
      return h.json({ deleted: true }, 200, cors);
    }
  }
  // Weekoefening instellen: deze week (zolang er nog geen resultaten zijn) of volgende week.
  if (rest === '/challenge' && method === 'PUT') {
    if (!isAdmin) return forbidden();
    const body = await h.bodyJson(request);
    if (!(body.kind in CHALLENGE_KINDS)) return h.fail('Kies een weekoefening: scoretraining 30, 60 of 99 pijlen of rond de klok.', 400, cors);
    const week = body.week === 'next' ? clubWeek(now, 1) : clubWeek(now);
    if (week === clubWeek(now) && !weekOpen(week, now)) return h.fail('Deze week is al gesloten. Kies de oefening voor volgende week.', 409, cors);
    const existing = await challengeOf(env, clubId, week);
    if (existing) {
      const results = (await env.DB.prepare('SELECT COUNT(*) AS n FROM club_results WHERE challenge_id = ?').bind(existing.id).first()).n;
      if (results && existing.kind !== body.kind) return h.fail('Er zijn al resultaten voor deze week; de oefening kan niet meer wijzigen.', 409, cors);
      await env.DB.prepare('UPDATE club_challenges SET kind = ? WHERE id = ?').bind(body.kind, existing.id).run();
    } else {
      await env.DB.prepare("INSERT INTO club_challenges(id, club_id, week, kind, created_by, created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(newId(), clubId, week, body.kind, member.id).run();
    }
    return h.json({ week, kind: body.kind, closesAt: closesAt(week) }, 200, cors);
  }
  if (rest === '/challenge' && method === 'GET') {
    const u = new URL(request.url);
    const w = u.searchParams.get('week');
    const week = w === 'previous' ? clubWeek(now, -1) : w === 'next' ? clubWeek(now, 1) : clubWeek(now);
    return h.json(await challengeView(env, clubId, week, member.id, now), 200, cors);
  }
  // Een training delen met de club: per training kiest het lid zelf voor de feed en/of de weekoefening.
  if (rest === '/trainings' && method === 'POST') {
    const body = await h.bodyJson(request);
    const t = body.training;
    if (!trainingOkay(t)) return h.fail('Training heeft een ongeldig formaat.', 400, cors);
    if (body.feed !== true && body.challenge !== true) return h.fail('Kies of je deze training in de feed en/of bij de weekoefening zet.', 400, cors);
    const out = {};
    if (body.challenge === true) {
      const week = clubWeek(now);
      const c = await challengeOf(env, clubId, week);
      if (!c) return h.fail('Er is deze week geen weekoefening.', 409, cors);
      if (!weekOpen(week, now)) return h.fail('De weekoefening is gesloten (zondag 22:00).', 409, cors);
      if (c.kind !== t.kind) return h.fail('Deze training hoort niet bij de weekoefening van deze week.', 409, cors);
      const value = resultValue(t);
      const old = await env.DB.prepare('SELECT value FROM club_results WHERE challenge_id = ? AND member_id = ?').bind(c.id, member.id).first();
      if (!old || better(c.kind, value, old.value)) {
        await env.DB.prepare(
          "INSERT INTO club_results(challenge_id, club_id, member_id, training_id, darts, points, high, value, submitted_at) VALUES(?,?,?,?,?,?,?,?,datetime('now')) " +
          "ON CONFLICT(challenge_id, member_id) DO UPDATE SET training_id = excluded.training_id, darts = excluded.darts, points = excluded.points, " +
          'high = excluded.high, value = excluded.value, submitted_at = excluded.submitted_at'
        ).bind(c.id, clubId, member.id, t.trainingId, t.darts, t.points, t.high ?? null, value).run();
        out.challenge = { best: true, value };
      } else out.challenge = { best: false, value: old.value };
    }
    if (body.feed === true) {
      await env.DB.prepare(
        "INSERT INTO club_feed(id, club_id, member_id, training_id, kind, darts, points, high, created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now')) " +
        'ON CONFLICT(club_id, member_id, training_id) DO NOTHING'
      ).bind(newId(), clubId, member.id, t.trainingId, t.kind, t.darts, t.points, t.high ?? null).run();
      out.feed = true;
    }
    return h.json(out, 201, cors);
  }
  // Weekresultaat verwijderen: eigen resultaat, of door de beheerder (bijv. een onmogelijke score).
  const resHandle = rest.match(/^\/results\/([a-z0-9]{12})$/)?.[1];
  if (resHandle && method === 'DELETE') {
    const own = resHandle === member.handle;
    if (!own && !isAdmin) return forbidden();
    const c = await challengeOf(env, clubId, clubWeek(now));
    const target = await env.DB.prepare("SELECT cm.member_id AS id FROM club_members cm JOIN members m ON m.id = cm.member_id WHERE cm.club_id = ? AND m.handle = ?").bind(clubId, resHandle).first();
    if (!c || !target) return h.fail('Resultaat niet gevonden.', 404, cors);
    const r = await env.DB.prepare('DELETE FROM club_results WHERE challenge_id = ? AND club_id = ? AND member_id = ?').bind(c.id, clubId, target.id).run();
    if (!r.meta?.changes) return h.fail('Resultaat niet gevonden.', 404, cors);
    return h.json({ removed: resHandle }, 200, cors);
  }
  // Clubfeed (laatste 14 dagen, hoogstens 50 berichten).
  if (rest === '/feed' && method === 'GET') {
    const rows = await env.DB.prepare(
      "SELECT f.id, m.id AS memberId, m.handle, m.nickname, f.kind, f.darts, f.points, f.high, f.created_at AS at FROM club_feed f " +
      "JOIN club_members cm ON cm.club_id = f.club_id AND cm.member_id = f.member_id AND cm.status = 'active' JOIN members m ON m.id = f.member_id " +
      "WHERE f.club_id = ? AND f.created_at >= datetime('now', '-14 days') ORDER BY f.created_at DESC, f.rowid DESC LIMIT ?"
    ).bind(clubId, CLUB_LIMITS.feedItems).all();
    return h.json({ feed: (rows.results || []).map(({ memberId, ...r }) => ({ ...r, you: memberId === member.id,
      average: r.kind === 'clock' ? null : Math.round(r.points / r.darts * 300) / 100 })) }, 200, cors);
  }
  const feedId = rest.match(/^\/feed\/([a-f0-9]{32})$/)?.[1];
  if (feedId && method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM club_feed WHERE id = ? AND club_id = ? AND (member_id = ? OR ? = 1)').bind(feedId, clubId, member.id, isAdmin ? 1 : 0).run();
    if (!r.meta?.changes) return h.fail('Bericht niet gevonden.', 404, cors);
    return h.json({ removed: feedId }, 200, cors);
  }
  // Vormranglijst: gemiddelde laatste 4 weken.
  if (rest === '/form' && method === 'GET') {
    return h.json({ weeks: CLUB_LIMITS.formWeeks, ranking: await formRanking(env, clubId, member.id, now) }, 200, cors);
  }
  return h.fail('Onbekende route.', 404, cors);
}
