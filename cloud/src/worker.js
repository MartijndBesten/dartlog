import { adminHtml } from './admin-page.js';
import { isAdminRequest, adminEmail, adminHostMatches } from './admin-auth.js';
import { handleGroups, groupsOpen, inviteValid, releaseMemberships } from './groups.js';

// Cloudflare Worker + D1 API voor OKKIE. Community.
// De database bewaart uitsluitend een nickname, account-credentials (gehasht) en geaggregeerde statistieken.
// Geen e-mail, privétrainingen, pijlen of exacte trainingstijdstippen.
//
// Beveiligingslagen (zie ../INFRASTRUCTUUR.md):
// - CORS alleen voor ALLOWED_ORIGINS; schrijfacties alleen vanaf die origins.
// - Registratie alleen als REGISTRATION_ENABLED exact "true" is (standaard dicht), daarna nog Turnstile (fail-closed).
// - Rate limiting via Cloudflare-bindings (RL_REGISTER, RL_WRITE); zonder binding draait de API gewoon door.
// - Beheer (/beheer, /v1/admin/*) alleen op het beheerdomein met een geverifieerd Cloudflare Access-JWT (admin-auth.js).
// - Vaste beveiligingsheaders op elk antwoord; interne fouten lekken nooit naar buiten.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const json = (data, status = 200, cors = {}, cache = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, ...SECURITY_HEADERS, ...cors } });
const fail = (message, status, cors) => json({ error: message }, status, cors);
const utf8 = new TextEncoder();
const HANDLE = /^[a-z0-9]{12}$/;

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' };
}
function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  return !!origin && allowedOrigins(env).includes(origin);
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
  // Nieuw sinds Mijn vrienden; oudere apps sturen ze niet mee (dan null).
  for (const [k, darts] of [['best60', 60], ['best99', 99]]) {
    if (x[k] === undefined) continue;
    if (x[k] !== null && (!Number.isSafeInteger(x[k]) || x[k] < 0 || x[k] > darts * 60 || x.darts < darts)) return false;
  }
  return true;
}
async function bodyJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^application\/json\b/i.test(type)) throw new Error('Verkeerd inhoudstype.');
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
function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'onbekend';
}
// Cloudflare Rate Limiting-binding; ontbreekt de binding (lokaal/test), dan is er geen limiet.
async function limited(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return false;
  try { return !(await binding.limit({ key })).success; } catch { return false; }
}
// Openbare registratie blijft dicht tot privacyverklaring en ouderlijke toestemming (<16) geregeld zijn.
// Alleen de exacte tekst "true" opent haar; ontbreken, "false", "1" of "TRUE" houden haar dicht.
const registrationOpen = env => env.REGISTRATION_ENABLED === 'true';
async function checkTurnstile(requestBody, request, env) {
  // Zonder configuratie worden geen nieuwe publieke accounts aangemaakt.
  if (!env.TURNSTILE_SECRET) return { error: 'Registratie is nog niet geactiveerd.' };
  const token = requestBody.turnstileToken;
  if (!token || typeof token !== 'string' || token.length > 2048) return { error: 'Bevestig eerst de anti-spamcontrole.' };
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

// ---------- Beheer: uitsluitend Cloudflare Access, geverifieerd in admin-auth.js ----------
// Geen token- of wachtwoordroute. Buiten het geconfigureerde beheerdomein bestaan de beheerroutes niet (404).
async function adminAuth(request, env) {
  if (!adminHostMatches(request, env)) return { hidden: true };
  const email = await adminEmail(request, env);
  return email ? { actor: email } : null;
}
async function audit(env, actor, action, target) {
  await env.DB.prepare("INSERT INTO admin_audit(at, actor, action, target) VALUES(datetime('now'),?,?,?)").bind(actor, action, target).run();
}

// Hulpfuncties voor groups.js (geen dubbele implementatie van auth, hashing of rate limiting).
const H = { json, fail, bodyJson, auth, limited, clientIp, hash, randomKey };

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const u = new URL(request.url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') {
      return originAllowed(request, env) ? new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors } }) : fail('Niet toegestaan.', 403);
    }
    if (path === '/v1/health' && request.method === 'GET') return json({ ok: true, version: 1, registration: registrationOpen(env), groups: groupsOpen(env) }, 200, cors);
    if (!env.DB) return fail('Database niet geconfigureerd.', 503, cors);
    if (request.method !== 'GET' && !originAllowed(request, env)) return fail('Onbekende herkomst.', 403, cors);
    try {
      // Privébeheer uitsluitend op het afzonderlijke beheerdomein. De Worker
      // verifieert de Access-JWT zelf: de Cloudflare Access-gateway alleen is niet genoeg.
      if (path === '/beheer' || path === '/v1/admin/overview') {
        if (request.method !== 'GET') return fail('Niet toegestaan.', 405, cors);
        if (!adminHostMatches(request, env)) return fail('Niet gevonden.', 404, cors);
        if (!await isAdminRequest(request, env)) return fail('Geen toegang.', 403, cors);
        if (path === '/beheer') {
          return new Response(adminHtml, { status: 200, headers: {
            'Content-Type':'text/html; charset=utf-8',
            'Cache-Control':'no-store, private',
            'X-Content-Type-Options':'nosniff',
            'X-Frame-Options':'DENY',
            'Referrer-Policy':'no-referrer',
            'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
          }});
        }
        const totals = await env.DB.prepare(
          "SELECT " +
          "(SELECT COUNT(*) FROM members) AS profiles, " +
          "(SELECT COUNT(*) FROM members WHERE visible = 1) AS publicProfiles, " +
          "(SELECT COUNT(DISTINCT member_id) FROM stats WHERE period = 'all' AND updated_at >= datetime('now','-7 days')) AS recentlySyncedProfiles, " +
          "(SELECT COALESCE(SUM(sessions),0) FROM stats WHERE period = 'all') AS sharedTrainings"
        ).first();
        const weekly = await env.DB.prepare(
          "SELECT period, COUNT(*) AS profiles, COALESCE(SUM(sessions),0) AS trainings, " +
          "COALESCE(SUM(darts),0) AS darts FROM stats WHERE period LIKE 'week:%' " +
          "GROUP BY period ORDER BY period DESC LIMIT 12"
        ).all();
        return json({ totals: totals || {}, weekly: weekly.results || [], notice:
          'Dit omvat uitsluitend vrijwillige communityaccounts en gedeelde trainingen; geen exacte telling van app-installaties.' }, 200,
          { 'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff' });
      }
      if (path === '/v1/register' && request.method === 'POST') {
        // Twee wegen: openbare registratie (REGISTRATION_ENABLED) of, als Mijn vrienden aanstaat, alleen met een geldige
        // uitnodiging voor een besloten groep. Beide staan standaard uit.
        if (!registrationOpen(env) && !groupsOpen(env)) return fail('Registratie is nog gesloten.', 403, cors);
        if (await limited(env.RL_REGISTER, clientIp(request))) return fail('Te veel registraties vanaf dit adres. Probeer het over een minuut opnieuw.', 429, cors);
        const body = await bodyJson(request);
        const nickname = cleanNickname(body.nickname);
        const viaInvite = typeof body.inviteToken === 'string';
        const viaFounder = !viaInvite && typeof body.founderCode === 'string';
        if (viaInvite || viaFounder) {
          // Besloten groep: geen openbaar profiel (visible = 0). Alleen 16+; jongere spelers wachten op ouderlijke toestemming.
          // Oprichterscode: geheim GROUP_FOUNDER_CODE (min. 16 tekens) voor het allereerste account zonder uitnodiging.
          const founderOk = viaFounder && groupsOpen(env) && String(env.GROUP_FOUNDER_CODE || '').length >= 16 &&
            await hash(body.founderCode) === await hash(env.GROUP_FOUNDER_CODE);
          if (viaFounder && !founderOk) return fail('Deze oprichterscode klopt niet.', 403, cors);
          if (viaInvite && !await inviteValid(env, H, body.inviteToken)) return fail('Deze uitnodiging is niet (meer) geldig. Vraag om een nieuwe link.', 403, cors);
          if (!nickname) return fail('Kies een nickname van 2 tot 24 tekens.', 400, cors);
          if (body.age !== 'adult') return fail('Voor spelers jonger dan 16 is eerst toestemming van een ouder of verzorger nodig. Dat kan nog niet in OKKIE.', 403, cors);
        } else {
          if (!registrationOpen(env)) return fail('Registratie is nog gesloten.', 403, cors);
          if (!nickname || body.share !== true) return fail('Kies een nickname en geef toestemming voor het publiceren van statistieken.', 400, cors);
          if (body.ageConsent !== true) return fail('Voor spelers jonger dan 16 jaar is toestemming en beheer door ouder/voogd nodig.', 400, cors);
          const check = await checkTurnstile(body, request, env);
          if (!check.ok) return fail(check.error, 403, cors);
        }
        const id = crypto.randomUUID();
        const handle = id.replaceAll('-', '').slice(0, 12);
        const token = randomKey(), recovery = randomKey();
        await env.DB.prepare("INSERT INTO members(id,handle,nickname,token_hash,recovery_hash,visible,age_group,created_at,updated_at) VALUES(?,?,?,?,?,?,'adult',datetime('now'),datetime('now'))")
          .bind(id,handle,nickname,await hash(token),await hash(recovery),viaInvite || viaFounder ? 0 : 1).run();
        return json({ account: { id, handle, nickname }, token, recovery, public: !(viaInvite || viaFounder) }, 201, cors);
      }
      if (path === '/v1/recover' && request.method === 'POST') {
        if (await limited(env.RL_REGISTER, clientIp(request))) return fail('Te veel herstelpogingen. Probeer het over een minuut opnieuw.', 429, cors);
        const body = await bodyJson(request);
        const handle = typeof body.handle === 'string' && HANDLE.test(body.handle) ? body.handle : null;
        const code = typeof body.recovery === 'string' && /^[a-f0-9]{64}$/.test(body.recovery) ? body.recovery : null;
        if (!handle || !code) return fail('Herstelcode of profielcode ongeldig.', 400, cors);
        const member = await env.DB.prepare('SELECT id, handle, nickname, recovery_hash, visible FROM members WHERE handle = ?').bind(handle).first();
        if (!member || member.recovery_hash !== await hash(code)) return fail('Herstelgegevens komen niet overeen.', 401, cors);
        const token = randomKey();
        await env.DB.prepare("UPDATE members SET token_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(await hash(token),member.id).run();
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
        // Publieke, niet-persoonlijke data: 30 s aan de rand cachen scheelt databaseverkeer bij drukte.
        return json({ period: key, ranking: rows.results || [], scoring: kind === 'week' ? 'eerste 30 pijlen van de week' : 'gewogen gemiddelde per 3 pijlen' }, 200, cors, 'public, max-age=30');
      }
      if (path.startsWith('/v1/players/') && request.method === 'GET') {
        const handle = path.split('/')[3];
        if (!HANDLE.test(handle || '')) return fail('Profiel niet gevonden.', 404, cors);
        const member = await env.DB.prepare('SELECT id, handle, nickname FROM members WHERE handle = ? AND visible = 1').bind(handle).first();
        if (!member) return fail('Profiel niet gevonden of afgeschermd.', 404, cors);
        const all = await env.DB.prepare('SELECT darts, points, sessions, highest_turn AS highestTurn, best30, hits100, hits140, hits180 FROM stats WHERE member_id = ? AND period = ?').bind(member.id, 'all').first();
        const trend = await env.DB.prepare("SELECT period, darts, points, sessions, challenge30 FROM stats WHERE member_id = ? AND period LIKE 'week:%' ORDER BY period DESC LIMIT 12").bind(member.id).all();
        return json({ player: publicMember(member), totals: all || null, trend: trend.results || [] }, 200, cors, 'public, max-age=30');
      }
      if (path.startsWith('/v1/me')) {
        const member = await auth(request, env);
        if (!member) return fail('Niet ingelogd; herstel je profiel met de herstelcode.', 401, cors);
        if (request.method !== 'GET' && await limited(env.RL_WRITE, member.id)) return fail('Te veel wijzigingen achter elkaar. Probeer het zo opnieuw.', 429, cors);
        if (path === '/v1/me' && request.method === 'GET') return json({ account: publicMember(member), enabled: !!member.visible }, 200, cors);
        if (path === '/v1/me' && request.method === 'PATCH') {
          const body = await bodyJson(request);
          const nickname = body.nickname === undefined ? member.nickname : cleanNickname(body.nickname);
          if (!nickname || (body.enabled !== undefined && typeof body.enabled !== 'boolean')) return fail('Ongeldige instellingen.', 400, cors);
          const enabled = body.enabled === undefined ? member.visible : (body.enabled ? 1 : 0);
          await env.DB.prepare("UPDATE members SET nickname = ?, visible = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(nickname,enabled,member.id).run();
          return json({ account: { ...publicMember(member), nickname }, enabled: !!enabled }, 200, cors);
        }
        if (path === '/v1/me' && request.method === 'DELETE') {
          // Stats verdwijnen via ON DELETE CASCADE (PRAGMA foreign_keys aan in D1); expliciet voor de zekerheid.
          // Eerst groepseigenaarschap doorgeven, zodat een vriendengroep niet zonder eigenaar achterblijft.
          await releaseMemberships(env, member.id);
          await env.DB.batch([
            env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(member.id),
            env.DB.prepare('DELETE FROM entitlements WHERE member_id = ?').bind(member.id),
            env.DB.prepare('DELETE FROM members WHERE id = ?').bind(member.id),
          ]);
          return json({ deleted: true }, 200, cors);
        }
        // Delen stoppen: alle gedeelde statistieken wissen; profiel en groepslidmaatschappen blijven.
        if (path === '/v1/me/snapshots' && request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(member.id).run();
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
              'INSERT INTO stats (member_id,period,darts,points,sessions,highest_turn,hits100,hits140,hits180,best30,best60,best99,challenge30,updated_at) ' +
              "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))"
            ).bind(member.id,s.period,s.darts,s.points,s.sessions,s.highestTurn,s.hits100,s.hits140,s.hits180,s.best30,s.best60 ?? null,s.best99 ?? null,s.challenge30));
          }
          statements.push(env.DB.prepare("UPDATE members SET updated_at = datetime('now') WHERE id = ?").bind(member.id));
          await env.DB.batch(statements);
          return json({ saved: body.snapshots.length }, 200, cors);
        }
      }
      // ----- Beheer: basis voor het privédashboard. Nooit hashes of tokens teruggeven. -----
      if (path.startsWith('/v1/admin')) {
        const admin = await adminAuth(request, env);
        if (admin?.hidden) return fail('Niet gevonden.', 404, cors);
        if (!admin) return fail('Geen toegang.', 403, cors);
        if (path === '/v1/admin/members' && request.method === 'GET') {
          const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit') || 50)));
          const rows = await env.DB.prepare(
            'SELECT m.handle, m.nickname, m.visible, m.created_at AS createdAt, m.updated_at AS updatedAt, ' +
            'COALESCE(s.sessions, 0) AS sessions, COALESCE(s.darts, 0) AS darts FROM members m ' +
            "LEFT JOIN stats s ON s.member_id = m.id AND s.period = 'all' ORDER BY m.created_at DESC LIMIT ?"
          ).bind(limit).all();
          return json({ members: rows.results || [] }, 200, cors);
        }
        const target = path.match(/^\/v1\/admin\/members\/([a-z0-9]{12})$/)?.[1];
        if (target && request.method === 'PATCH') {
          const body = await bodyJson(request);
          if (typeof body.visible !== 'boolean') return fail('Ongeldige instellingen.', 400, cors);
          const r = await env.DB.prepare("UPDATE members SET visible = ?, updated_at = datetime('now') WHERE handle = ?").bind(body.visible ? 1 : 0, target).run();
          if (!r.meta?.changes) return fail('Profiel niet gevonden.', 404, cors);
          await audit(env, admin.actor, body.visible ? 'show' : 'hide', target);
          return json({ handle: target, visible: body.visible }, 200, cors);
        }
        if (target && request.method === 'DELETE') {
          const member = await env.DB.prepare('SELECT id FROM members WHERE handle = ?').bind(target).first();
          if (!member) return fail('Profiel niet gevonden.', 404, cors);
          await releaseMemberships(env, member.id);
          await env.DB.batch([
            env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(member.id),
            env.DB.prepare('DELETE FROM entitlements WHERE member_id = ?').bind(member.id),
            env.DB.prepare('DELETE FROM members WHERE id = ?').bind(member.id),
          ]);
          await audit(env, admin.actor, 'delete', target);
          return json({ deleted: true, handle: target }, 200, cors);
        }
        if (path === '/v1/admin/audit' && request.method === 'GET') {
          const rows = await env.DB.prepare('SELECT at, actor, action, target FROM admin_audit ORDER BY id DESC LIMIT 100').all();
          return json({ audit: rows.results || [] }, 200, cors);
        }
        return fail('Onbekende beheerroute.', 404, cors);
      }
      const groups = await handleGroups(request, env, path, H, cors);
      if (groups) return groups;
      return fail('Onbekende route.', 404, cors);
    } catch (e) {
      // Interne details mogen nooit aan bezoekers worden getoond.
      if (e instanceof SyntaxError) return fail('Ongeldige JSON.', 400, cors);
      if (e.message === 'Het verzoek is te groot.') return fail(e.message, 413, cors);
      if (e.message === 'Verkeerd inhoudstype.') return fail('Stuur JSON (Content-Type: application/json).', 415, cors);
      console.error('OKKIE Community API:', e);
      return fail('Er ging iets mis op de server.', 500, cors);
    }
  },

  // Dagelijkse opschoning (bewaartermijnen uit INFRASTRUCTUUR.md). Verwijdert alleen:
  // - accounts die nooit statistieken hebben gepubliceerd en ouder zijn dan EMPTY_ACCOUNT_DAYS (standaard 30);
  // - accounts zonder enige activiteit sinds INACTIVE_DAYS (standaard 730, twee jaar).
  async scheduled(event, env) {
    if (!env.DB) return;
    const emptyDays = Math.max(1, Number(env.EMPTY_ACCOUNT_DAYS || 30));
    const inactiveDays = Math.max(30, Number(env.INACTIVE_DAYS || 730));
    const empty = await env.DB.prepare(
      "DELETE FROM members WHERE id IN (SELECT m.id FROM members m LEFT JOIN stats s ON s.member_id = m.id WHERE s.member_id IS NULL AND m.created_at < datetime('now', ?) AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.member_id = m.id))"
    ).bind(`-${emptyDays} days`).run();
    const stale = await env.DB.prepare('SELECT id FROM members WHERE updated_at < datetime(\'now\', ?)').bind(`-${inactiveDays} days`).all();
    for (const row of stale.results || []) {
      await releaseMemberships(env, row.id);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM stats WHERE member_id = ?').bind(row.id),
        env.DB.prepare('DELETE FROM entitlements WHERE member_id = ?').bind(row.id),
        env.DB.prepare('DELETE FROM members WHERE id = ?').bind(row.id),
      ]);
    }
    console.log(`OKKIE opschoning: ${empty.meta?.changes || 0} lege accounts, ${(stale.results || []).length} inactieve accounts verwijderd.`);
  },
};

export const internals = { cleanNickname, snapshotOkay, currentPeriod, SECURITY_HEADERS };
