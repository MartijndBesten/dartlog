// Integratietests van de volledige API op een echte SQLite-database (node:sqlite), zonder Cloudflare-account.
// Turnstile, Cloudflare Access (JWKS) en rate limiting worden nagebootst.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker, { internals } from '../src/worker.js';
import { createD1 } from './d1-shim.js';

const ORIGIN = 'https://martijndbesten.github.io';
const API = 'https://api.okkiedarts.nl';
const baseEnv = () => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN + ',https://okkiedarts.nl', TURNSTILE_SECRET: 'test-secret' });

// Nagebootste externe diensten: Turnstile-siteverify en de Access-JWKS.
const realFetch = globalThis.fetch;
let turnstileOk = true;
let jwks = { keys: [] };
before(() => {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('challenges.cloudflare.com/turnstile')) {
      const token = init.body.get('response');
      return new Response(JSON.stringify({ success: turnstileOk && token === 'ok-token' }));
    }
    if (u.endsWith('/cdn-cgi/access/certs')) return new Response(JSON.stringify(jwks));
    throw new Error('Onverwachte externe aanroep in test: ' + u);
  };
});
after(() => { globalThis.fetch = realFetch; });

const call = (env, path, { method = 'GET', body, token, origin = ORIGIN, headers = {} } = {}) => {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return worker.fetch(new Request(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
};
const snap = (period, points, darts = 30, extra = {}) => ({ period, darts, points, sessions: darts / 30, highestTurn: 100, hits100: 1, hits140: 0, hits180: 0, best30: darts === 30 ? points : null, challenge30: darts === 30 ? points : null, ...extra });
const thisWeek = internals.currentPeriod('week');

async function register(env, nickname = 'Senn') {
  const r = await call(env, '/v1/register', { method: 'POST', body: { nickname, share: true, ageConsent: true, turnstileToken: 'ok-token' } });
  assert.equal(r.status, 201);
  return r.json();
}

test('registratie: Turnstile verplicht, toestemming verplicht, geheimen alleen gehasht opgeslagen', async () => {
  const env = baseEnv();
  let r = await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Senn', share: true, ageConsent: true, turnstileToken: 'fout' } });
  assert.equal(r.status, 403);
  r = await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Senn', share: false, ageConsent: true, turnstileToken: 'ok-token' } });
  assert.equal(r.status, 400);
  r = await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Senn', share: true, ageConsent: false, turnstileToken: 'ok-token' } });
  assert.equal(r.status, 400);
  const acc = await register(env);
  assert.match(acc.token, /^[a-f0-9]{64}$/);
  assert.match(acc.recovery, /^[a-f0-9]{64}$/);
  assert.match(acc.account.handle, /^[a-z0-9]{12}$/);
  const row = env.DB.raw.prepare('SELECT token_hash, recovery_hash FROM members').get();
  assert.notEqual(row.token_hash, acc.token);
  assert.notEqual(row.recovery_hash, acc.recovery);
  // Zonder TURNSTILE_SECRET: registratie dicht
  const closed = await call({ ...env, TURNSTILE_SECRET: '' }, '/v1/register', { method: 'POST', body: { nickname: 'X Y', share: true, ageConsent: true, turnstileToken: 'ok-token' } });
  assert.equal(closed.status, 403);
  assert.equal((await closed.json()).error, 'Registratie is nog niet geactiveerd.');
});

test('schrijfacties alleen vanaf toegestane origins, met JSON en beperkte grootte', async () => {
  const env = baseEnv();
  assert.equal((await call(env, '/v1/register', { method: 'POST', body: {}, origin: 'https://kwaad.example' })).status, 403);
  assert.equal((await call(env, '/v1/register', { method: 'POST', body: {}, origin: null })).status, 403);
  const noJson = await worker.fetch(new Request(API + '/v1/register', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: 'x' }), env);
  assert.equal(noJson.status, 415);
  const big = await worker.fetch(new Request(API + '/v1/register', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{"a":"' + 'x'.repeat(60000) + '"}' }), env);
  assert.equal(big.status, 413);
  const broken = await worker.fetch(new Request(API + '/v1/register', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{kapot' }), env);
  assert.equal(broken.status, 400);
});

test('beveiligingsheaders op elk antwoord, CORS alleen voor bekende origins', async () => {
  const env = baseEnv();
  const r = await call(env, '/v1/leaderboard');
  for (const [k, v] of Object.entries(internals.SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, k);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const other = await call(env, '/v1/leaderboard', { origin: 'https://kwaad.example' });
  assert.equal(other.status, 200, 'publieke data blijft leesbaar');
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null, 'maar zonder CORS-vrijgave');
  const err = await call(env, '/v1/onbekend');
  assert.equal(err.status, 404);
  assert.equal(err.headers.get('X-Content-Type-Options'), 'nosniff');
});

test('snapshots publiceren, ranglijst per periode, profiel bekijken', async () => {
  const env = baseEnv();
  const a = await register(env, 'Senn');
  const b = await register(env, 'Papa');
  let r = await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 1800, 60), snap(thisWeek, 900), snap('month:' + thisWeek.slice(5, 12), 900)] } });
  assert.equal(r.status, 200);
  r = await call(env, '/v1/me/snapshots', { method: 'PUT', token: b.token, body: { snapshots: [snap('all', 600), snap(thisWeek, 600)] } });
  assert.equal(r.status, 200);
  const week = await (await call(env, '/v1/leaderboard?period=week')).json();
  assert.deepEqual(week.ranking.map(x => x.nickname), ['Senn', 'Papa'], 'week: op challenge30');
  const all = await (await call(env, '/v1/leaderboard?period=all')).json();
  assert.deepEqual(all.ranking.map(x => x.nickname), ['Senn', 'Papa'], 'alle tijden: op gewogen gemiddelde');
  assert.equal(JSON.stringify(all).includes('token'), false);
  assert.equal((await call(env, '/v1/leaderboard?period=jaar')).status, 400);
  const profile = await (await call(env, '/v1/players/' + a.account.handle)).json();
  assert.equal(profile.player.nickname, 'Senn');
  assert.equal(profile.totals.darts, 60);
  assert.equal(profile.trend.length, 1);
  assert.equal((await call(env, '/v1/players/onbekend12345')).status, 404);
  // Ongeldige snapshots worden als geheel geweigerd
  r = await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 99999)] } });
  assert.equal(r.status, 400);
  r = await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 600), snap('all', 600)] } });
  assert.equal(r.status, 400);
  assert.equal((await (await call(env, '/v1/players/' + a.account.handle)).json()).totals.darts, 60, 'oude stats blijven staan na afgekeurde upload');
});

test('verbergen haalt profiel van ranglijst, verwijderen wist alles (cascade)', async () => {
  const env = baseEnv();
  const a = await register(env, 'Senn');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 600), snap(thisWeek, 600)] } });
  let r = await call(env, '/v1/me', { method: 'PATCH', token: a.token, body: { enabled: false, nickname: 'Senn D' } });
  assert.deepEqual(await r.json(), { account: { ...a.account, nickname: 'Senn D' }, enabled: false });
  assert.equal((await (await call(env, '/v1/leaderboard?period=week')).json()).ranking.length, 0);
  assert.equal((await call(env, '/v1/players/' + a.account.handle)).status, 404);
  assert.equal((await call(env, '/v1/me', { method: 'PATCH', token: a.token, body: { nickname: '<b>' } })).status, 400);
  r = await call(env, '/v1/me', { method: 'DELETE', token: a.token });
  assert.equal(r.status, 200);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM members').get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM stats').get().n, 0);
  assert.equal((await call(env, '/v1/me', { token: a.token })).status, 401, 'token ongeldig na verwijderen');
});

test('herstel op ander toestel trekt de oude sessie in', async () => {
  const env = baseEnv();
  const a = await register(env, 'Senn');
  assert.equal((await call(env, '/v1/recover', { method: 'POST', body: { handle: a.account.handle, recovery: 'f'.repeat(64) } })).status, 401);
  const r = await call(env, '/v1/recover', { method: 'POST', body: { handle: a.account.handle, recovery: a.recovery } });
  assert.equal(r.status, 200);
  const fresh = await r.json();
  assert.notEqual(fresh.token, a.token);
  assert.equal((await call(env, '/v1/me', { token: a.token })).status, 401);
  assert.equal((await call(env, '/v1/me', { token: fresh.token })).status, 200);
});

test('rate limiting via Cloudflare-binding: 429 zodra de limiet is bereikt', async () => {
  let hits = 0;
  const env = { ...baseEnv(), RL_REGISTER: { limit: async ({ key }) => ({ success: key === '1.2.3.4' ? ++hits <= 2 : true }) } };
  const reg = () => call(env, '/v1/register', { method: 'POST', body: { nickname: 'Senn', share: true, ageConsent: true, turnstileToken: 'ok-token' }, headers: { 'CF-Connecting-IP': '1.2.3.4' } });
  assert.equal((await reg()).status, 201);
  assert.equal((await reg()).status, 201);
  assert.equal((await reg()).status, 429);
  const other = await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Oma', share: true, ageConsent: true, turnstileToken: 'ok-token' }, headers: { 'CF-Connecting-IP': '9.9.9.9' } });
  assert.equal(other.status, 201, 'ander adres niet geraakt');
});

test('beheer: dicht zonder configuratie, ADMIN_TOKEN lokaal, Cloudflare Access-JWT in productie', async () => {
  const env = baseEnv();
  assert.equal((await call(env, '/v1/admin/overview')).status, 503);
  const withToken = { ...env, ADMIN_TOKEN: 'x'.repeat(40) };
  assert.equal((await call(withToken, '/v1/admin/overview')).status, 401);
  assert.equal((await call(withToken, '/v1/admin/overview', { token: 'y'.repeat(40) })).status, 401);
  const a = await register(env, 'Senn');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 600), snap(thisWeek, 600)] } });
  let r = await call(withToken, '/v1/admin/overview', { token: 'x'.repeat(40) });
  assert.equal(r.status, 200);
  const ov = await r.json();
  assert.equal(ov.members.total, 1);
  assert.equal(ov.stats.thisWeek, 1);
  const list = await (await call(withToken, '/v1/admin/members', { token: 'x'.repeat(40) })).json();
  assert.equal(list.members[0].handle, a.account.handle);
  assert.equal(JSON.stringify(list).includes('hash'), false, 'nooit hashes naar het dashboard');

  // Cloudflare Access: JWT ondertekend met een testsleutel, JWKS nagebootst
  const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  jwks = { keys: [{ ...jwk, kid: 'k1', use: 'sig', alg: 'RS256' }] };
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sign = async (payload) => {
    const data = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' }) + '.' + enc(payload);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(data));
    return data + '.' + Buffer.from(sig).toString('base64url');
  };
  const access = { ...env, ACCESS_TEAM_DOMAIN: 'okkie.cloudflareaccess.com', ACCESS_AUD: 'aud-123', ADMIN_TOKEN: 'x'.repeat(40) };
  const good = await sign({ aud: ['aud-123'], iss: 'https://okkie.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) + 600, email: 'beheer@denckh.nl' });
  r = await call(access, '/v1/admin/overview', { headers: { 'Cf-Access-Jwt-Assertion': good } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).actor, 'beheer@denckh.nl');
  assert.equal((await call(access, '/v1/admin/overview', { token: 'x'.repeat(40) })).status, 401, 'ADMIN_TOKEN telt niet meer zodra Access actief is');
  const expired = await sign({ aud: ['aud-123'], iss: 'https://okkie.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) - 10, email: 'x' });
  assert.equal((await call(access, '/v1/admin/overview', { headers: { 'Cf-Access-Jwt-Assertion': expired } })).status, 401);
  const wrongAud = await sign({ aud: ['ander'], iss: 'https://okkie.cloudflareaccess.com', exp: Math.floor(Date.now() / 1000) + 600 });
  assert.equal((await call(access, '/v1/admin/overview', { headers: { 'Cf-Access-Jwt-Assertion': wrongAud } })).status, 401);
  const tampered = good.slice(0, -4) + 'AAAA';
  assert.equal((await call(access, '/v1/admin/overview', { headers: { 'Cf-Access-Jwt-Assertion': tampered } })).status, 401);

  // Moderatie: verbergen en verwijderen, met logboek
  r = await call(access, '/v1/admin/members/' + a.account.handle, { method: 'PATCH', body: { visible: false }, headers: { 'Cf-Access-Jwt-Assertion': good } });
  assert.equal(r.status, 200);
  assert.equal((await (await call(env, '/v1/leaderboard?period=week')).json()).ranking.length, 0);
  r = await call(access, '/v1/admin/members/' + a.account.handle, { method: 'DELETE', headers: { 'Cf-Access-Jwt-Assertion': good } });
  assert.equal(r.status, 200);
  const log = await (await call(access, '/v1/admin/audit', { headers: { 'Cf-Access-Jwt-Assertion': good } })).json();
  assert.deepEqual(log.audit.map(x => x.action), ['delete', 'hide']);
  assert.equal(log.audit[0].actor, 'beheer@denckh.nl');
  assert.equal((await call(access, '/v1/admin/members/' + a.account.handle, { method: 'DELETE', headers: { 'Cf-Access-Jwt-Assertion': good } })).status, 404);
});

test('opschoning: lege accounts na 30 dagen, inactieve accounts na 2 jaar, actieve blijven', async () => {
  const env = baseEnv();
  const a = await register(env, 'Actief');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 600)] } });
  const b = await register(env, 'Leeg oud');
  env.DB.raw.prepare("UPDATE members SET created_at = datetime('now','-40 days') WHERE handle = ?").run(b.account.handle);
  const c = await register(env, 'Leeg nieuw');
  const d = await register(env, 'Inactief');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: d.token, body: { snapshots: [snap('all', 600)] } });
  env.DB.raw.prepare("UPDATE members SET updated_at = datetime('now','-800 days') WHERE handle = ?").run(d.account.handle);
  await worker.scheduled({}, env);
  const left = env.DB.raw.prepare('SELECT nickname FROM members ORDER BY nickname').all().map(x => x.nickname);
  assert.deepEqual(left, ['Actief', 'Leeg nieuw']);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM stats').get().n, 1);
  assert.ok(c);
});

test('nickname-regels en snapshotvalidatie (bestaande interne checks)', () => {
  assert.equal(internals.cleanNickname(' Senn  '), 'Senn');
  assert.equal(internals.cleanNickname('<script>'), null);
  assert.equal(internals.snapshotOkay(snap('all', 600)), true);
  assert.equal(internals.snapshotOkay(snap('all', 600, 31)), false, 'pijlen altijd veelvoud van 3');
});
