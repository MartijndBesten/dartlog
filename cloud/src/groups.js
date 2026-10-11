// OKKIE. Mijn vrienden: besloten vriendengroepen. Alle toegangscontrole gebeurt hier, server-side.
// - Alleen leden zien een groep; voor niet-leden bestaat ze niet (404, ook bij een geldig groeps-ID).
// - Een uitnodigingslink geeft geen toegang tot gegevens: alleen naam en ledenaantal, en lid worden vereist een
//   ingelogd account. Tokens worden alleen als SHA-256 bewaard.
// - Per groep kiest een speler expliciet wat hij deelt (gemiddelde, records, challenge); de rest komt nooit mee.
// - Voor alle leeftijden. Jonger dan 16: een ouder/verzorger bevestigt per groep via een link, zonder ouderaccount
//   (tenzij MINOR_CONSENT = "dienst" na een juridisch besluit). Zie VRIENDEN.md.
// Staat standaard UIT: GROUPS_ENABLED moet exact "true" zijn.

export const LIMITS = {
  groupsPerMember: 10,
  membersPerGroup: 50,
  activeInvitesPerGroup: 20,
  inviteMaxDays: 30,
  inviteMaxUses: 50,
  trendWeeks: 8,
};
export const groupsOpen = env => env.GROUPS_ENABLED === 'true';
// Spelers jonger dan 16: alleen als MINORS_OPEN exact "true" is (na juridische toets en DPIA, zie VRIENDEN.md).
// Staat het uit, dan kan geen kind een profiel maken of toestemming laten geven; intrekken blijft altijd mogelijk.
export const minorsOpen = env => env.MINORS_OPEN === 'true';
export const MINORS_CLOSED = 'Mijn vrienden is voorlopig alleen voor spelers van 16 jaar en ouder. Je trainingen in OKKIE. werken gewoon door.';
const GROUP_ID = /^[a-f0-9]{32}$/;
const HANDLE = /^[a-z0-9]{12}$/;
const TOKEN = /^[a-f0-9]{64}$/;

export function cleanGroupName(input) {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
  return /^[\p{L}\p{N} ._'!&()+-]{2,40}$/u.test(name) ? name : null;
}
function shareFlags(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const k of ['average', 'records', 'challenge']) {
    if (typeof input[k] !== 'boolean') return null;
    out[k] = input[k];
  }
  return out;
}
// Maandag (UTC) van de week, zoals de app en de publieke ranglijst.
export function weekKey(date = new Date(), offsetWeeks = 0) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7 - offsetWeeks * 7);
  return 'week:' + d.toISOString().slice(0, 10);
}

async function membership(env, groupId, memberId) {
  return env.DB.prepare(
    'SELECT g.id, g.name, g.max_members AS maxMembers, gm.role, gm.share_average, gm.share_records, gm.share_challenge ' +
    'FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE g.id = ? AND gm.member_id = ?'
  ).bind(groupId, memberId).first();
}
async function memberCount(env, groupId) {
  return (await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').bind(groupId).first()).n;
}
async function findInvite(env, h, token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  return env.DB.prepare(
    "SELECT i.id, i.group_id AS groupId, g.name, g.max_members AS maxMembers, i.expires_at AS expiresAt FROM group_invites i " +
    "JOIN groups g ON g.id = i.group_id WHERE i.token_hash = ? AND i.revoked_at IS NULL AND i.uses < i.max_uses " +
    "AND i.expires_at > datetime('now')"
  ).bind(await h.hash(token)).first();
}
// Bruikbaar vanuit /v1/register: is dit een geldige, nog bruikbare uitnodiging?
export async function inviteValid(env, h, token) {
  return groupsOpen(env) && !!(await findInvite(env, h, token));
}
// Bij verwijderen van een account (zelf, beheer of opschoning): eigenaarschap doorgeven, lege groepen opruimen.
export async function releaseMemberships(env, memberId) {
  const owned = await env.DB.prepare("SELECT group_id AS id FROM group_members WHERE member_id = ? AND role = 'owner'").bind(memberId).all();
  for (const g of owned.results || []) await handOver(env, g.id, memberId);
  await env.DB.prepare('DELETE FROM group_members WHERE member_id = ?').bind(memberId).run();
}
async function handOver(env, groupId, leavingId) {
  const next = await env.DB.prepare(
    "SELECT member_id AS id FROM group_members WHERE group_id = ? AND member_id != ? " +
    "ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at, rowid LIMIT 1"
  ).bind(groupId, leavingId).first();
  if (next) {
    await env.DB.prepare("UPDATE group_members SET role = 'owner' WHERE group_id = ? AND member_id = ?").bind(groupId, next.id).run();
  } else {
    await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
  }
}

// Gedeelde statistieken van alle leden, gefilterd op wat ieder lid zelf deelt.
async function groupStats(env, groupId, viewerId) {
  const rows = await env.DB.prepare(
    'SELECT m.id, m.handle, m.nickname, gm.role, gm.joined_at AS joinedAt, gm.share_average, gm.share_records, gm.share_challenge ' +
    'FROM group_members gm JOIN members m ON m.id = gm.member_id WHERE gm.group_id = ? ORDER BY gm.joined_at, gm.rowid'
  ).bind(groupId).all();
  const members = rows.results || [];
  const oldest = weekKey(new Date(), LIMITS.trendWeeks - 1);
  const stats = await env.DB.prepare(
    'SELECT s.member_id AS id, s.period, s.darts, s.points, s.sessions, s.highest_turn AS highestTurn, s.hits100, s.hits140, s.hits180, ' +
    's.best30, s.best60, s.best99, s.challenge30, s.updated_at AS updatedAt FROM stats s JOIN group_members gm ON gm.member_id = s.member_id ' +
    "WHERE gm.group_id = ? AND (s.period = 'all' OR (s.period LIKE 'week:%' AND s.period >= ?))"
  ).bind(groupId, oldest).all();
  const byMember = new Map();
  for (const s of stats.results || []) {
    if (!byMember.has(s.id)) byMember.set(s.id, []);
    byMember.get(s.id).push(s);
  }
  const thisWeek = weekKey();
  const pick = (s, keys) => s ? Object.fromEntries(keys.map(k => [k, s[k] ?? null])) : null;
  return members.map(m => {
    const own = byMember.get(m.id) || [];
    const all = own.find(s => s.period === 'all');
    const week = own.find(s => s.period === thisWeek);
    const share = { average: !!m.share_average, records: !!m.share_records, challenge: !!m.share_challenge };
    const out = { handle: m.handle, nickname: m.nickname, role: m.role, you: m.id === viewerId, joinedAt: m.joinedAt.slice(0, 10), share,
      updatedAt: all?.updatedAt?.slice(0, 10) || null };
    if (share.average) {
      out.average = { all: pick(all, ['darts', 'points', 'sessions']), week: pick(week, ['darts', 'points', 'sessions']),
        weeks: own.filter(s => s.period.startsWith('week:')).sort((a, b) => a.period.localeCompare(b.period))
          .map(s => ({ week: s.period.slice(5), darts: s.darts, points: s.points, sessions: s.sessions })) };
    }
    if (share.records) {
      const rec = ['highestTurn', 'best30', 'best60', 'best99', 'hits100', 'hits140', 'hits180'];
      out.records = { all: pick(all, rec), week: pick(week, rec) };
    }
    if (share.challenge) out.challenge = { week: thisWeek.slice(5), points: week?.challenge30 ?? null };
    return out;
  });
}

// Lid worden via een (nog geldige) uitnodiging. Gedeeld door direct lid worden en door ouderlijke toestemming.
async function joinViaInvite(env, invite, memberId, share) {
  if (await membership(env, invite.groupId, memberId)) return { status: 200, body: { group: { id: invite.groupId, name: invite.name }, already: true } };
  const mine = (await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE member_id = ?').bind(memberId).first()).n;
  if (mine >= LIMITS.groupsPerMember) return { status: 409, error: `Je zit al in ${LIMITS.groupsPerMember} groepen; verlaat er eerst één.` };
  if (await memberCount(env, invite.groupId) >= invite.maxMembers) return { status: 409, error: 'Deze groep is vol.' };
  // Gebruik atomair ophogen, zodat een link nooit vaker werkt dan toegestaan.
  const used = await env.DB.prepare(
    "UPDATE group_invites SET uses = uses + 1 WHERE id = ? AND uses < max_uses AND revoked_at IS NULL AND expires_at > datetime('now')"
  ).bind(invite.id).run();
  if (!used.meta?.changes) return { status: 404, error: 'Deze uitnodiging is niet (meer) geldig. Vraag om een nieuwe link.' };
  await env.DB.prepare(
    "INSERT INTO group_members(group_id, member_id, role, share_average, share_records, share_challenge, joined_at) VALUES(?,?,'member',?,?,?,datetime('now'))"
  ).bind(invite.groupId, memberId, +share.average, +share.records, +share.challenge).run();
  return { status: 201, body: { group: { id: invite.groupId, name: invite.name }, joined: true } };
}
// ---------- Ouderlijke toestemming (jonger dan 16), per kind én per groep, zonder ouderaccount ----------
// Geldt voor spelers met age_group 'minor', tenzij MINOR_CONSENT = "dienst" (consent_method 'dienst').
const needsParent = member => member.ageGroup === 'minor' && member.consentMethod !== 'dienst';
const SHARE_KEYS = ['average', 'records', 'challenge'];
const flagsOf = row => ({ average: !!row.share_average, records: !!row.share_records, challenge: !!row.share_challenge });
const within = (share, approved) => SHARE_KEYS.every(k => !share[k] || approved[k]);

// Wat een ouder voor deze groep het laatst heeft goedgekeurd (null = geen toestemming).
async function approvedShare(env, memberId, groupId) {
  const row = await env.DB.prepare(
    'SELECT share_average, share_records, share_challenge FROM parent_consents WHERE member_id = ? AND group_id = ? ' +
    'AND confirmed_at IS NOT NULL ORDER BY confirmed_at DESC, rowid DESC LIMIT 1'
  ).bind(memberId, groupId).first();
  return row ? flagsOf(row) : null;
}
// Mag de server statistieken van dit kind bewaren? Alleen als het in minstens één groep zit mét gegeven toestemming.
export async function minorMayStore(env, memberId) {
  return !!(await env.DB.prepare(
    'SELECT 1 AS ok FROM parent_consents pc JOIN group_members gm ON gm.group_id = pc.group_id AND gm.member_id = pc.member_id ' +
    'WHERE pc.member_id = ? AND pc.confirmed_at IS NOT NULL LIMIT 1'
  ).bind(memberId).first());
}
// Eén groep verlaten, inclusief de toestemmingen voor die groep (en eigenaarschap doorgeven).
async function leaveGroup(env, groupId, memberId) {
  const row = await env.DB.prepare('SELECT role FROM group_members WHERE group_id = ? AND member_id = ?').bind(groupId, memberId).first();
  if (row?.role === 'owner') await handOver(env, groupId, memberId);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND member_id = ?').bind(groupId, memberId),
    env.DB.prepare('DELETE FROM parent_consents WHERE group_id = ? AND member_id = ?').bind(groupId, memberId),
  ]);
}
async function deleteAccount(env, memberId) {
  await releaseMemberships(env, memberId);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(memberId),
    env.DB.prepare('DELETE FROM entitlements WHERE member_id = ?').bind(memberId),
    env.DB.prepare('DELETE FROM members WHERE id = ?').bind(memberId),
  ]);
}
async function consentByToken(env, h, token) {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null;
  return env.DB.prepare(
    'SELECT pc.id, pc.member_id AS memberId, pc.group_id AS groupId, pc.kind, pc.invite_id AS inviteId, pc.group_name AS groupName, ' +
    'pc.share_average, pc.share_records, pc.share_challenge, pc.confirmed_at AS confirmedAt, pc.expires_at AS expiresAt, ' +
    "pc.expires_at > datetime('now') AS valid, m.nickname, g.name AS currentGroupName " +
    'FROM parent_consents pc JOIN members m ON m.id = pc.member_id LEFT JOIN groups g ON g.id = pc.group_id WHERE pc.token_hash = ?'
  ).bind(await h.hash(token)).first();
}

// Afhandeling van /v1/groups*, /v1/invites* en /v1/consent*. Geeft null terug voor andere paden.
export async function handleGroups(request, env, path, h, cors) {
  if (!path.startsWith('/v1/groups') && !path.startsWith('/v1/invites') && !path.startsWith('/v1/consent')) return null;
  if (!groupsOpen(env)) return h.fail('Mijn vrienden is nog niet beschikbaar.', 404, cors);
  const method = request.method;
  const ipLimited = async () => h.limited(env.RL_REGISTER, 'invite:' + h.clientIp(request));

  // Uitnodiging bekijken: alleen groepsnaam en aantal leden, geen gegevens van leden.
  if (path === '/v1/invites/preview' && method === 'POST') {
    if (await ipLimited()) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
    const body = await h.bodyJson(request);
    const invite = await findInvite(env, h, body.token);
    if (!invite) return h.fail('Deze uitnodiging is niet (meer) geldig. Vraag om een nieuwe link.', 404, cors);
    return h.json({ group: { name: invite.name, members: await memberCount(env, invite.groupId) }, expiresAt: invite.expiresAt.slice(0, 10) }, 200, cors);
  }

  // Ouder/verzorger, zonder account: bekijken, toestemming geven of intrekken via de link voor één aanvraag.
  if (path.startsWith('/v1/consent/') && path !== '/v1/consent/request') {
    if (method !== 'POST') return h.fail('Niet toegestaan.', 405, cors);
    if (await ipLimited()) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
    const body = await h.bodyJson(request);
    const c = await consentByToken(env, h, body.token);
    // Een gegeven toestemming blijft bruikbaar om in te trekken; een openstaande aanvraag verloopt na 7 dagen.
    if (!c || (!c.confirmedAt && !c.valid)) return h.fail('Deze toestemmingslink is niet (meer) geldig. Vraag je kind om een nieuwe.', 404, cors);
    const share = flagsOf(c);
    const groupName = c.currentGroupName || c.groupName;
    if (path === '/v1/consent/preview') {
      const approved = c.kind === 'change' && c.groupId ? await approvedShare(env, c.memberId, c.groupId) : null;
      return h.json({ child: c.nickname, kind: c.kind, group: groupName, share, approved, confirmed: !!c.confirmedAt,
        expiresAt: c.confirmedAt ? null : c.expiresAt.slice(0, 10) }, 200, cors);
    }
    if (path === '/v1/consent/confirm') {
      if (!minorsOpen(env)) return h.fail(MINORS_CLOSED, 403, cors);
      if (body.parent !== true) return h.fail('Bevestig dat je de ouder of verzorger bent.', 400, cors);
      if (c.confirmedAt) return h.json({ confirmed: true, joined: true, group: groupName, already: true }, 200, cors);
      let groupId = c.groupId;
      if (c.kind === 'join') {
        const invite = c.inviteId ? await env.DB.prepare(
          'SELECT i.id, i.group_id AS groupId, g.name, g.max_members AS maxMembers FROM group_invites i JOIN groups g ON g.id = i.group_id ' +
          "WHERE i.id = ? AND i.revoked_at IS NULL AND i.uses < i.max_uses AND i.expires_at > datetime('now')"
        ).bind(c.inviteId).first() : null;
        if (!invite) return h.fail('De uitnodiging van de groep is verlopen. Je kind kan een nieuwe uitnodiging vragen; er is niets gedeeld.', 409, cors);
        const r = await joinViaInvite(env, invite, c.memberId, share);
        if (r.error) return h.fail(r.error, r.status, cors);
      } else if (c.kind === 'create') {
        const mine = (await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE member_id = ?').bind(c.memberId).first()).n;
        if (mine >= LIMITS.groupsPerMember) return h.fail(`Je kind zit al in ${LIMITS.groupsPerMember} groepen.`, 409, cors);
        groupId = crypto.randomUUID().replaceAll('-', '');
        await env.DB.batch([
          env.DB.prepare("INSERT INTO groups(id, name, created_by, max_members, created_at, updated_at) VALUES(?,?,?,?,datetime('now'),datetime('now'))")
            .bind(groupId, c.groupName, c.memberId, LIMITS.membersPerGroup),
          env.DB.prepare("INSERT INTO group_members(group_id, member_id, role, share_average, share_records, share_challenge, joined_at) VALUES(?,?,'owner',?,?,?,datetime('now'))")
            .bind(groupId, c.memberId, +share.average, +share.records, +share.challenge),
        ]);
      } else {
        const r = await env.DB.prepare('UPDATE group_members SET share_average = ?, share_records = ?, share_challenge = ? WHERE group_id = ? AND member_id = ?')
          .bind(+share.average, +share.records, +share.challenge, groupId, c.memberId).run();
        if (!r.meta?.changes) return h.fail('Je kind zit niet meer in deze groep.', 409, cors);
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE parent_consents SET confirmed_at = datetime('now'), group_id = ? WHERE id = ?").bind(groupId, c.id),
        env.DB.prepare("UPDATE members SET consent_at = COALESCE(consent_at, datetime('now')), consent_method = 'ouderlink', updated_at = datetime('now') WHERE id = ?").bind(c.memberId),
      ]);
      return h.json({ confirmed: true, joined: true, group: groupName }, 200, cors);
    }
    if (path === '/v1/consent/withdraw') {
      // Alleen deze aanvraag/groep. Openstaand: aanvraag vervalt. Gegeven: kind verlaat die ene groep en alle toestemmingen
      // voor die groep vervallen. Zit het kind daarna nergens meer in, dan wordt het online profiel helemaal gewist.
      if (!c.confirmedAt) {
        await env.DB.prepare('DELETE FROM parent_consents WHERE id = ?').bind(c.id).run();
        return h.json({ withdrawn: true, group: groupName, accountDeleted: false }, 200, cors);
      }
      if (c.groupId) await leaveGroup(env, c.groupId, c.memberId);
      const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE member_id = ?').bind(c.memberId).first();
      if (!left.n) await deleteAccount(env, c.memberId);
      return h.json({ withdrawn: true, group: groupName, accountDeleted: !left.n }, 200, cors);
    }
    return h.fail('Onbekende route.', 404, cors);
  }

  const member = await h.auth(request, env);
  if (!member) return h.fail('Niet ingelogd; maak eerst je OKKIE.-profiel aan of herstel het.', 401, cors);
  if (method !== 'GET' && await h.limited(env.RL_WRITE, member.id)) return h.fail('Te veel wijzigingen achter elkaar. Probeer het zo opnieuw.', 429, cors);
  const parentFirst = (error = 'Vraag eerst een ouder of verzorger om toestemming.') => h.json({ needsParent: true, error }, 403, cors);

  // Kind vraagt toestemming: lid worden (inviteToken), een groep oprichten (groupName) of meer delen (groupId).
  if (path === '/v1/consent/request' && method === 'POST') {
    if (!minorsOpen(env)) return h.fail(MINORS_CLOSED, 403, cors);
    if (!needsParent(member)) return h.fail('Alleen nodig voor spelers jonger dan 16.', 400, cors);
    const body = await h.bodyJson(request);
    const share = shareFlags(body.share);
    if (!share || !Object.values(share).some(Boolean)) return h.fail('Kies wat je met de groep wilt delen.', 400, cors);
    let kind, groupId = null, inviteId = null, groupName = null;
    if (typeof body.inviteToken === 'string') {
      const invite = await findInvite(env, h, body.inviteToken);
      if (!invite) return h.fail('Deze uitnodiging is niet (meer) geldig. Vraag om een nieuwe link.', 404, cors);
      if (await membership(env, invite.groupId, member.id)) return h.fail('Je zit al in deze groep.', 409, cors);
      kind = 'join'; groupId = invite.groupId; inviteId = invite.id; groupName = invite.name;
    } else if (typeof body.groupName === 'string') {
      groupName = cleanGroupName(body.groupName);
      if (!groupName) return h.fail('Kies een groepsnaam van 2 tot 40 tekens.', 400, cors);
      kind = 'create';
    } else if (typeof body.groupId === 'string' && GROUP_ID.test(body.groupId)) {
      const mine = await membership(env, body.groupId, member.id);
      if (!mine) return h.fail('Groep niet gevonden.', 404, cors);
      const approved = await approvedShare(env, member.id, body.groupId);
      if (approved && within(share, approved)) return h.fail('Hiervoor is geen nieuwe toestemming nodig.', 400, cors);
      kind = 'change'; groupId = body.groupId; groupName = mine.name;
    } else return h.fail('Waarvoor vraag je toestemming?', 400, cors);
    const open = (await env.DB.prepare("SELECT COUNT(*) AS n FROM parent_consents WHERE member_id = ? AND confirmed_at IS NULL AND expires_at > datetime('now')").bind(member.id).first()).n;
    if (open >= 10) return h.fail('Er staan al veel aanvragen open. Vraag je ouder eerst die te bekijken.', 409, cors);
    const token = h.randomKey();
    // Alleen een openstaande aanvraag voor hetzelfde doel wordt vervangen; gegeven toestemmingen blijven ongemoeid.
    await env.DB.batch([
      kind === 'create'
        ? env.DB.prepare("DELETE FROM parent_consents WHERE member_id = ? AND kind = 'create' AND confirmed_at IS NULL AND group_name = ?").bind(member.id, groupName)
        : env.DB.prepare('DELETE FROM parent_consents WHERE member_id = ? AND group_id = ? AND kind = ? AND confirmed_at IS NULL').bind(member.id, groupId, kind),
      env.DB.prepare(
        'INSERT INTO parent_consents(id, member_id, group_id, kind, token_hash, invite_id, group_name, share_average, share_records, share_challenge, created_at, expires_at) ' +
        "VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now','+7 days'))"
      ).bind(crypto.randomUUID().replaceAll('-', ''), member.id, groupId, kind, await h.hash(token), inviteId, kind === 'create' ? groupName : null,
        +share.average, +share.records, +share.challenge),
    ]);
    return h.json({ token, kind, group: groupName }, 201, cors);
  }

  // Lid worden via uitnodiging (jonger dan 16: via ouderlink).
  if (path === '/v1/invites/accept' && method === 'POST') {
    if (needsParent(member)) return parentFirst();
    if (await ipLimited()) return h.fail('Te veel pogingen. Probeer het over een minuut opnieuw.', 429, cors);
    const body = await h.bodyJson(request);
    const share = shareFlags(body.share);
    if (!share) return h.fail('Kies wat je met deze groep deelt.', 400, cors);
    const invite = await findInvite(env, h, body.token);
    if (!invite) return h.fail('Deze uitnodiging is niet (meer) geldig. Vraag om een nieuwe link.', 404, cors);
    const r = await joinViaInvite(env, invite, member.id, share);
    return r.error ? h.fail(r.error, r.status, cors) : h.json(r.body, r.status, cors);
  }

  // Mijn groepen.
  if (path === '/v1/groups' && method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT g.id, g.name, gm.role, (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS members ' +
      'FROM group_members gm JOIN groups g ON g.id = gm.group_id WHERE gm.member_id = ? ORDER BY g.name'
    ).bind(member.id).all();
    const pending = needsParent(member) ? (await env.DB.prepare(
      'SELECT pc.kind, COALESCE(g.name, pc.group_name) AS name FROM parent_consents pc LEFT JOIN groups g ON g.id = pc.group_id ' +
      "WHERE pc.member_id = ? AND pc.confirmed_at IS NULL AND pc.expires_at > datetime('now') ORDER BY pc.created_at"
    ).bind(member.id).all()).results || [] : [];
    return h.json({ groups: rows.results || [], limits: LIMITS,
      me: { ageGroup: member.ageGroup, needsParent: needsParent(member), waitingForParent: pending } }, 200, cors);
  }
  if (path === '/v1/groups' && method === 'POST') {
    // Jonger dan 16: een eigen groep oprichten gaat via de ouderlink (soort 'create'), net als lid worden.
    if (needsParent(member)) return parentFirst();
    const body = await h.bodyJson(request);
    const name = cleanGroupName(body.name);
    const share = shareFlags(body.share);
    if (!name) return h.fail('Kies een groepsnaam van 2 tot 40 tekens (letters, cijfers en . _ \' ! & ( ) + -).', 400, cors);
    if (!share) return h.fail('Kies wat je met deze groep deelt.', 400, cors);
    const mine = (await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE member_id = ?').bind(member.id).first()).n;
    if (mine >= LIMITS.groupsPerMember) return h.fail(`Je zit al in ${LIMITS.groupsPerMember} groepen; verlaat er eerst één.`, 409, cors);
    const id = crypto.randomUUID().replaceAll('-', '');
    await env.DB.batch([
      env.DB.prepare("INSERT INTO groups(id, name, created_by, max_members, created_at, updated_at) VALUES(?,?,?,?,datetime('now'),datetime('now'))")
        .bind(id, name, member.id, LIMITS.membersPerGroup),
      env.DB.prepare("INSERT INTO group_members(group_id, member_id, role, share_average, share_records, share_challenge, joined_at) VALUES(?,?,'owner',?,?,?,datetime('now'))")
        .bind(id, member.id, +share.average, +share.records, +share.challenge),
    ]);
    return h.json({ group: { id, name, role: 'owner' } }, 201, cors);
  }

  const m = path.match(/^\/v1\/groups\/([^/]+)(\/.*)?$/);
  if (!m) return h.fail('Onbekende route.', 404, cors);
  const [, groupId, rest = ''] = m;
  // Geen lid (of ongeldig ID): de groep bestaat voor jou niet.
  const me = GROUP_ID.test(groupId) ? await membership(env, groupId, member.id) : null;
  if (!me) return h.fail('Groep niet gevonden.', 404, cors);
  const isOwner = me.role === 'owner', isAdmin = isOwner || me.role === 'admin';
  const forbidden = () => h.fail('Alleen de beheerder van de groep kan dit.', 403, cors);

  if (rest === '' && method === 'GET') {
    return h.json({ group: { id: groupId, name: me.name, role: me.role, maxMembers: me.maxMembers },
      week: weekKey().slice(5), members: await groupStats(env, groupId, member.id) }, 200, cors);
  }
  if (rest === '' && method === 'PATCH') {
    if (!isAdmin) return forbidden();
    const name = cleanGroupName((await h.bodyJson(request)).name);
    if (!name) return h.fail('Kies een groepsnaam van 2 tot 40 tekens.', 400, cors);
    await env.DB.prepare("UPDATE groups SET name = ?, updated_at = datetime('now') WHERE id = ?").bind(name, groupId).run();
    return h.json({ group: { id: groupId, name } }, 200, cors);
  }
  if (rest === '' && method === 'DELETE') {
    if (!isOwner) return h.fail('Alleen de eigenaar kan de groep opheffen.', 403, cors);
    await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
    return h.json({ deleted: true }, 200, cors);
  }
  // Eigen deelinstellingen en verlaten.
  if (rest === '/me' && method === 'PATCH') {
    const share = shareFlags((await h.bodyJson(request)).share);
    if (!share) return h.fail('Ongeldige deelinstellingen.', 400, cors);
    // Jonger dan 16: minder delen mag altijd; meer delen dan de ouder voor deze groep goedkeurde niet.
    if (needsParent(member)) {
      const approved = await approvedShare(env, member.id, groupId);
      if (!approved || !within(share, approved)) return parentFirst('Meer delen dan je ouder heeft goedgekeurd? Vraag eerst toestemming.');
    }
    await env.DB.prepare('UPDATE group_members SET share_average = ?, share_records = ?, share_challenge = ? WHERE group_id = ? AND member_id = ?')
      .bind(+share.average, +share.records, +share.challenge, groupId, member.id).run();
    return h.json({ share }, 200, cors);
  }
  if (rest === '/me' && method === 'DELETE') {
    await leaveGroup(env, groupId, member.id);
    return h.json({ left: true }, 200, cors);
  }
  // Leden beheren.
  const target = rest.match(/^\/members\/([a-z0-9]{12})$/)?.[1];
  if (target && (method === 'DELETE' || method === 'PATCH')) {
    if (!isAdmin) return forbidden();
    const row = await env.DB.prepare('SELECT gm.member_id AS id, gm.role FROM group_members gm JOIN members m ON m.id = gm.member_id WHERE gm.group_id = ? AND m.handle = ?')
      .bind(groupId, target).first();
    if (!row || !HANDLE.test(target)) return h.fail('Lid niet gevonden.', 404, cors);
    if (row.role === 'owner') return h.fail('De eigenaar kan niet worden verwijderd of gewijzigd.', 403, cors);
    if (method === 'DELETE') {
      if (row.role === 'admin' && !isOwner) return forbidden();
      await leaveGroup(env, groupId, row.id);
      return h.json({ removed: target }, 200, cors);
    }
    if (!isOwner) return h.fail('Alleen de eigenaar kan rollen wijzigen.', 403, cors);
    const role = (await h.bodyJson(request)).role;
    if (role !== 'admin' && role !== 'member') return h.fail('Ongeldige rol.', 400, cors);
    await env.DB.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND member_id = ?').bind(role, groupId, row.id).run();
    return h.json({ handle: target, role }, 200, cors);
  }
  // Uitnodigingen.
  if (rest === '/invites' && method === 'GET') {
    if (!isAdmin) return forbidden();
    const rows = await env.DB.prepare(
      "SELECT id, created_at AS createdAt, expires_at AS expiresAt, uses, max_uses AS maxUses, revoked_at AS revokedAt, " +
      "CASE WHEN revoked_at IS NULL AND uses < max_uses AND expires_at > datetime('now') THEN 1 ELSE 0 END AS active " +
      'FROM group_invites WHERE group_id = ? ORDER BY created_at DESC LIMIT 50'
    ).bind(groupId).all();
    return h.json({ invites: (rows.results || []).map(r => ({ ...r, active: !!r.active })) }, 200, cors);
  }
  if (rest === '/invites' && method === 'POST') {
    if (!isAdmin) return forbidden();
    const body = await h.bodyJson(request);
    const days = body.days ?? 7, uses = body.maxUses ?? 30;
    if (!Number.isInteger(days) || days < 1 || days > LIMITS.inviteMaxDays || !Number.isInteger(uses) || uses < 1 || uses > LIMITS.inviteMaxUses) {
      return h.fail(`Een uitnodiging is 1 tot ${LIMITS.inviteMaxDays} dagen geldig en voor 1 tot ${LIMITS.inviteMaxUses} personen.`, 400, cors);
    }
    const active = (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM group_invites WHERE group_id = ? AND revoked_at IS NULL AND uses < max_uses AND expires_at > datetime('now')"
    ).bind(groupId).first()).n;
    if (active >= LIMITS.activeInvitesPerGroup) return h.fail('Er staan al te veel open uitnodigingen; trek er eerst één in.', 409, cors);
    const token = h.randomKey();
    const id = crypto.randomUUID().replaceAll('-', '');
    await env.DB.prepare("INSERT INTO group_invites(id, group_id, token_hash, created_by, created_at, expires_at, max_uses) VALUES(?,?,?,?,datetime('now'),datetime('now', ?),?)")
      .bind(id, groupId, await h.hash(token), member.id, `+${days} days`, uses).run();
    // Het token wordt alleen nu teruggegeven; de server bewaart alleen de hash.
    return h.json({ invite: { id, token, days, maxUses: uses } }, 201, cors);
  }
  const inviteId = rest.match(/^\/invites\/([a-f0-9]{32})$/)?.[1];
  if (inviteId && method === 'DELETE') {
    if (!isAdmin) return forbidden();
    const r = await env.DB.prepare("UPDATE group_invites SET revoked_at = datetime('now') WHERE id = ? AND group_id = ? AND revoked_at IS NULL").bind(inviteId, groupId).run();
    if (!r.meta?.changes) return h.fail('Uitnodiging niet gevonden.', 404, cors);
    return h.json({ revoked: inviteId }, 200, cors);
  }
  return h.fail('Onbekende route.', 404, cors);
}
