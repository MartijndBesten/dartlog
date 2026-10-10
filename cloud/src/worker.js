// Cloudflare Worker + D1 API voor OKKIE. Community.
// De database bewaart uitsluitend een nickname, account-credentials (gehasht) en geaggregeerde statistieken.
// Geen e-mail, privétrainingen, pijlen of exacte trainingstijdstippen.
const json = (data, status = 200, cors = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
const fail = (message, status, cors) => json({ error: message }, status, cors);
const utf8 = new TextEncoder();

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allow = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allow.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Vary': 'Origin' };
}
function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !!origin && (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).includes(origin);
}
async function hash(input) {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(input));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function randomKey() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function cleanNickname(input) {
  const nickname = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
  return /^[\p{L}\p{N} ._-]{2,24}$/u.test(nickname) ? nickname : null;
}
function snapshotOkay(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  if (!(x.period === 'all' || /^week:\d{4}-\d{2}-\d{2}$/.test(x.period) || /^month:\d{4}-\d{2}$/.test(x.period))) return false;
  const fields = ['darts','points','sessions','highestTurn','hits100','hits140','hits180'];
  if (!fields.every(k => Number.isSafeInteger(x[k]) && x[k] >= 0)) return false;
  if (x.darts > 3000000 || x.darts % 3 !== 0 || x.sessions > 100000 || x.sessions > x.darts/3) return false;
  if (x.points > x.darts * 60 || x.highestTurn > 180 || x.hits100 > x.darts/3 ||
    x.hits140 > x.hits100 || x.hits180 > x.hits140) return false;
  for (const k of ['best30','challenge30']) {
    if (x[k] !== null && (!Number.isSafeInteger(x[k]) || x[k] < 0 || x[k] > 1800 || x.darts < 30)) return false;
  }
  return true;
}
async function bodyJson(request) {
  const length = Number(request.headers.get('Content-Length') || '0');
  if (length > 50000) throw new Error('Het verzoek is te groot.');
  const raw = await request.text();
  if (raw.length > 50000) throw new Error('Het verzoek is te groot.');
  return JSON.parse(raw);
}
async function auth(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const digest = await hash(token);
  return env.DB.prepare('SELECT id, handle, nickname, visible FROM members WHERE token_hash = ?').bind(digest).first();
}
async function checkTurnstile(requestBody, request, env) {
  // Zonder configuratie worden geen nieuwe publieke accounts aangemaakt.
  if (!env.TURNSTILE_SECRET) return { error: 'Registratie is nog niet geactiveerd.' };
  const token = requestBody.turnstileToken;
  if (!token || typeof token !== 'string') return { error: 'Bevestig eerst de anti-spamcontrole.' };
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET);
  form.set('response', token);
  form.set('remoteip', request.headers.get('CF-Connecting-IP') || '');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const result = await response.json().catch(() => ({ success: false }));
  return result.success ? { ok: true } : { error: 'De anti-spamcontrole is niet gelukt.' };
}
function publicMember(row) {
  return { id: row.id, handle: row.handle, nickname: row.nickname };
}
function currentPeriod(input) {
  const today = new Date();
  let key = 'all';
  if (input === 'week') {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    key = 'week:' + d.toISOString().slice(0, 10);
  }
  if (input === 'month') key = 'month:' + today.toISOString().slice(0, 7);
  return key;
}
export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const u = new URL(request.url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') {
      return originAllowed(request, env) ? new Response(null, { status: 204, headers: cors }) : fail('Niet toegestaan.', 403);
    }
    if (path === '/v1/health' && request.method === 'GET') return json({ ok: true, version: 1 }, 200, cors);
    if (!env.DB) return fail('Database niet geconfigureerd.', 503, cors);
    if (request.method !== 'GET' && !originAllowed(request, env)) return fail('Onbekende herkomst.', 403, cors);
    try {
      if (path === '/v1/register' && request.method === 'POST') {
        const body = await bodyJson(request);
        const nickname = cleanNickname(body.nickname);
        if (!nickname || body.share !== true) return fail('Kies een nickname en geef toestemming voor het publiceren van statistieken.', 400, cors);
        if (body.ageConsent !== true) return fail('Voor spelers jonger dan 16 jaar is toestemming en beheer door ouder/voogd nodig.', 400, cors);
        const check = await checkTurnstile(body, request, env);
        if (!check.ok) return fail(check.error, 403, cors);
        const id = crypto.randomUUID();
        const handle = id.replaceAll('-', '').slice(0, 12);
        const token = randomKey(), recovery = randomKey();
        await env.DB.prepare('INSERT INTO members(id,handle,nickname,token_hash,recovery_hash,visible,created_at,updated_at) VALUES(?,?,?,?,?,1,datetime("now"),datetime("now"))')
          .bind(id,handle,nickname,await hash(token),await hash(recovery)).run();
        return json({ account: { id, handle, nickname }, token, recovery }, 201, cors);
      }
      if (path === '/v1/recover' && request.method === 'POST') {
        const body = await bodyJson(request);
        const handle = typeof body.handle === 'string' && /^[a-z0-9]{12}$/.test(body.handle) ? body.handle : null;
        const code = typeof body.recovery === 'string' && /^[a-f0-9]{64}$/.test(body.recovery) ? body.recovery : null;
        if (!handle || !code) return fail('Herstelcode of profielcode ongeldig.', 400, cors);
        const member = await env.DB.prepare('SELECT id, handle, nickname, recovery_hash, visible FROM members WHERE handle = ?').bind(handle).first();
        if (!member || member.recovery_hash !== await hash(code)) return fail('Herstelgegevens komen niet overeen.', 401, cors);
        const token = randomKey();
        await env.DB.prepare('UPDATE members SET token_hash = ?, updated_at = datetime("now") WHERE id = ?').bind(await hash(token),member.id).run();
        return json({ account: publicMember(member), token, recovery: code, enabled: !!member.visible }, 200, cors);
      }
      if (path === '/v1/leaderboard' && request.method === 'GET') {
        const kind = u.searchParams.get('period') || 'week';
        if (!['all','week','month'].includes(kind)) return fail('Ongeldige periode.', 400, cors);
        const key = currentPeriod(kind);
        const rows = await env.DB.prepare(
          'SELECT m.id, m.handle, m.nickname, s.darts, s.points, s.sessions, s.highest_turn AS highestTurn, ' +
          's.best30, s.challenge30, s.hits100, s.hits140, s.hits180 FROM stats s JOIN members m ON m.id = s.member_id ' +
          'WHERE m.visible = 1 AND s.period = ? AND s.darts >= 30 ORDER BY ' +
          (kind === 'week' ? '(CASE WHEN s.challenge30 IS NULL THEN -1 ELSE s.challenge30 END) DESC, s.sessions DESC, m.handle ASC' :
            '(s.points * 1.0 / s.darts) DESC, s.sessions DESC, m.handle ASC') + ' LIMIT 100'
        ).bind(key).all();
        return json({ period: key, ranking: rows.results || [], scoring: kind === 'week' ? 'eerste 30 pijlen van de week' : 'gewogen gemiddelde per 3 pijlen' }, 200, cors);
      }
      if (path.startsWith('/v1/players/') && request.method === 'GET') {
        const handle = path.split('/')[3];
        if (!/^[a-z0-9]{12}$/.test(handle || '')) return fail('Profiel niet gevonden.', 404, cors);
        const member = await env.DB.prepare('SELECT id, handle, nickname FROM members WHERE handle = ? AND visible = 1').bind(handle).first();
        if (!member) return fail('Profiel niet gevonden of afgeschermd.', 404, cors);
        const all = await env.DB.prepare('SELECT darts, points, sessions, highest_turn AS highestTurn, best30, hits100, hits140, hits180 FROM stats WHERE member_id = ? AND period = ?').bind(member.id, 'all').first();
        const trend = await env.DB.prepare('SELECT period, darts, points, sessions, challenge30 FROM stats WHERE member_id = ? AND period LIKE "week:%" ORDER BY period DESC LIMIT 12').bind(member.id).all();
        return json({ player: publicMember(member), totals: all || null, trend: trend.results || [] }, 200, cors);
      }
      if (path.startsWith('/v1/me')) {
        const member = await auth(request, env);
        if (!member) return fail('Niet ingelogd; herstel je profiel met de herstelcode.', 401, cors);
        if (path === '/v1/me' && request.method === 'GET') return json({ account: publicMember(member), enabled: !!member.visible }, 200, cors);
        if (path === '/v1/me' && request.method === 'PATCH') {
          const body = await bodyJson(request);
          const nickname = body.nickname === undefined ? member.nickname : cleanNickname(body.nickname);
          if (!nickname || (body.enabled !== undefined && typeof body.enabled !== 'boolean')) return fail('Ongeldige instellingen.', 400, cors);
          const enabled = body.enabled === undefined ? member.visible : (body.enabled ? 1 : 0);
          await env.DB.prepare('UPDATE members SET nickname = ?, visible = ?, updated_at = datetime("now") WHERE id = ?')
            .bind(nickname,enabled,member.id).run();
          return json({ account: { ...publicMember(member), nickname }, enabled: !!enabled }, 200, cors);
        }
        if (path === '/v1/me' && request.method === 'DELETE') {
          // Stats verdwijnen via ON DELETE CASCADE (PRAGMA foreign_keys aan in D1).
          await env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(member.id).run();
          await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(member.id).run();
          return json({ deleted: true }, 200, cors);
        }
        if (path === '/v1/me/snapshots' && request.method === 'PUT') {
          const body = await bodyJson(request);
          if (!Array.isArray(body.snapshots) || body.snapshots.length > 190 ||
              body.snapshots.some(x => !snapshotOkay(x))) return fail('Statistieken hebben een ongeldig formaat.', 400, cors);
          const periods = body.snapshots.map(x => x.period);
          if (new Set(periods).size !== periods.length) return fail('Dubbele perioden.', 400, cors);
          const statements = [env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(member.id)];
          for (const s of body.snapshots) {
            statements.push(env.DB.prepare(
              'INSERT INTO stats (member_id,period,darts,points,sessions,highest_turn,hits100,hits140,hits180,best30,challenge30,updated_at) ' +
              'VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime("now"))'
            ).bind(member.id,s.period,s.darts,s.points,s.sessions,s.highestTurn,s.hits100,s.hits140,s.hits180,s.best30,s.challenge30));
          }
          await env.DB.batch(statements);
          return json({ saved: body.snapshots.length }, 200, cors);
        }
      }
      return fail('Onbekende route.', 404, cors);
    } catch (e) {
      // Interne details mogen nooit aan bezoekers worden getoond.
      if (e instanceof SyntaxError) return fail('Ongeldige JSON.', 400, cors);
      if (e.message === 'Het verzoek is te groot.') return fail(e.message, 413, cors);
      console.error('OKKIE Community API:', e);
      return fail('Er ging iets mis op de server.', 500, cors);
    }
  }
};

export const internals = { cleanNickname, snapshotOkay, currentPeriod };
