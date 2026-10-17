// Integratietests van de volledige API op een echte SQLite-database (node:sqlite), zonder Cloudflare-account.
// Turnstile, Cloudflare Access (JWKS) en rate limiting worden nagebootst.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker, { internals } from '../src/worker.js';
import { createD1 } from './d1-shim.js';

const ORIGIN = 'https://martijndbesten.github.io';
const API = 'https://api.okkiedarts.nl';
const baseEnv = () => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN + ',https://okkiedarts.nl', TURNSTILE_SECRET: 'test-secret', REGISTRATION_ENABLED: 'true' });

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

test('registratie blijft gesloten zolang REGISTRATION_ENABLED niet exact "true" is, ook met Turnstile', async () => {
  const body = { nickname: 'Senn', share: true, ageConsent: true, turnstileToken: 'ok-token' };
  for (const value of [undefined, '', 'false', 'FALSE', 'TRUE', '1', 'yes', ' true', true]) {
    const env = { ...baseEnv(), REGISTRATION_ENABLED: value };
    assert.ok(env.TURNSTILE_SECRET, 'Turnstile is wel geconfigureerd');
    const r = await call(env, '/v1/register', { method: 'POST', body });
    assert.equal(r.status, 403, `REGISTRATION_ENABLED=${JSON.stringify(value)} moet dicht zijn`);
    assert.equal((await r.json()).error, 'Registratie is nog gesloten.');
    assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM members').get().n, 0, 'er is geen account aangemaakt');
    const health = await (await call(env, '/v1/health')).json();
    assert.equal(health.registration, false);
  }
  // De openbare ranglijst en profielen werken wél terwijl registratie dicht is.
  const env = baseEnv();
  const a = await register(env, 'Senn');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap(thisWeek, 900), snap('all', 900)] } });
  const closed = { ...env, REGISTRATION_ENABLED: 'false' };
  const board = await call(closed, '/v1/leaderboard?period=week');
  assert.equal(board.status, 200);
  assert.deepEqual((await board.json()).ranking.map(r => r.nickname), ['Senn']);
  assert.equal((await call(closed, '/v1/players/' + a.account.handle)).status, 200);
  assert.equal((await call(closed, '/v1/register', { method: 'POST', body })).status, 403);
});

test('wrangler.toml: registratie staat in staging én productie expliciet op "false"', async () => {
  const { readFileSync } = await import('node:fs');
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const sections = toml.split(/^\[/m);
  const vars = sections.filter(s => /^(env\.production\.)?vars\]/.test(s));
  assert.equal(vars.length, 2);
  for (const s of vars) assert.match(s, /^REGISTRATION_ENABLED = "false"\r?$/m);
  assert.doesNotMatch(toml, /REGISTRATION_ENABLED = "true"/);
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

test('beheer: alleen op beheer.okkiedarts.nl met geldig Access-JWT van een toegestane beheerder', async () => {
  const env = baseEnv();
  const BEHEER = 'https://beheer.okkiedarts.nl';
  const admin = (e, path, { method = 'GET', body, jwt, host = BEHEER } = {}) => {
    const h = {};
    if (jwt) h['Cf-Access-Jwt-Assertion'] = jwt;
    if (method !== 'GET') h.Origin = BEHEER;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    return worker.fetch(new Request(host + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
  };
  // Zonder configuratie bestaat beheer niet, ook niet met een token
  assert.equal((await admin(env, '/v1/admin/members')).status, 404);
  assert.equal((await call({ ...env, ADMIN_TOKEN: 'x'.repeat(40) }, '/v1/admin/members', { token: 'x'.repeat(40) })).status, 404, 'geen tokenroute');

  const a = await register(env, 'Senn');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 600), snap(thisWeek, 600)] } });

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
  const aud = 'a1b2c3d4'.repeat(8);
  const access = { ...env, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS + ',' + BEHEER, ADMIN_HOST: 'beheer.okkiedarts.nl', CF_ACCESS_TEAM_DOMAIN: 'okkie.cloudflareaccess.com', CF_ACCESS_AUD: aud, ADMIN_ALLOWED_EMAILS: 'beheer@denckh.nl' };
  const exp = Math.floor(Date.now() / 1000) + 600;
  const good = await sign({ aud: [aud], iss: 'https://okkie.cloudflareaccess.com', exp, email: 'Beheer@denckh.nl' });

  let r = await admin(access, '/v1/admin/members', { jwt: good });
  assert.equal(r.status, 200);
  const list = await r.json();
  assert.equal(list.members[0].handle, a.account.handle);
  assert.equal(JSON.stringify(list).includes('hash'), false, 'nooit hashes naar het dashboard');
  r = await admin(access, '/v1/admin/overview', { jwt: good });
  assert.equal(r.status, 200);

  assert.equal((await admin(access, '/v1/admin/members', { jwt: good, host: API })).status, 404, 'niet via het API-domein');
  assert.equal((await admin(access, '/v1/admin/members')).status, 403);
  const stranger = await sign({ aud: [aud], iss: 'https://okkie.cloudflareaccess.com', exp, email: 'iemand@example.com' });
  assert.equal((await admin(access, '/v1/admin/members', { jwt: stranger })).status, 403, 'alleen toegestane e-mailadressen');
  const expired = await sign({ aud: [aud], iss: 'https://okkie.cloudflareaccess.com', exp: exp - 1200, email: 'beheer@denckh.nl' });
  assert.equal((await admin(access, '/v1/admin/members', { jwt: expired })).status, 403);
  const wrongAud = await sign({ aud: ['ander'], iss: 'https://okkie.cloudflareaccess.com', exp, email: 'beheer@denckh.nl' });
  assert.equal((await admin(access, '/v1/admin/members', { jwt: wrongAud })).status, 403);
  assert.equal((await admin(access, '/v1/admin/members', { jwt: good.slice(0, -4) + 'AAAA' })).status, 403);
  // Productie zonder (volledige) Access-configuratie: beheerdomein bestaat, maar alles blijft dicht, ook met geldig JWT.
  for (const missing of ['CF_ACCESS_TEAM_DOMAIN', 'CF_ACCESS_AUD', 'ADMIN_ALLOWED_EMAILS']) {
    const partial = { ...access, [missing]: '' };
    for (const p of ['/beheer', '/v1/admin/overview', '/v1/admin/members', '/v1/admin/audit']) {
      // Zonder volledige configuratie bestaat beheer niet (404): dicht, en verraadt niets.
      const res = await admin(partial, p, { jwt: good });
      assert.equal(res.status, 404, `${p} zonder ${missing}`);
      assert.doesNotMatch(await res.text(), /Senn|totals|members|<html/i);
    }
  }

  // Moderatie: verbergen en verwijderen, met logboek
  r = await admin(access, '/v1/admin/members/' + a.account.handle, { method: 'PATCH', body: { visible: false }, jwt: good });
  assert.equal(r.status, 200);
  assert.equal((await (await call(env, '/v1/leaderboard?period=week')).json()).ranking.length, 0);
  r = await admin(access, '/v1/admin/members/' + a.account.handle, { method: 'DELETE', jwt: good });
  assert.equal(r.status, 200);
  const log = await (await admin(access, '/v1/admin/audit', { jwt: good })).json();
  assert.deepEqual(log.audit.map(x => x.action), ['delete', 'hide']);
  assert.equal(log.audit[0].actor, 'beheer@denckh.nl');
  assert.equal((await admin(access, '/v1/admin/members/' + a.account.handle, { method: 'DELETE', jwt: good })).status, 404);
});
test('opschoning: lege accounts na 30 dagen, inactieve accounts na 2 jaar, actieve blijven', async () => {
  const env = baseEnv();
  const a = await register(env, 'Actief');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 600)] } });
  const b = await register(env, 'Leeg oud');
  env.DB.raw.prepare("UPDATE members SET created_at = datetime('now','-40 days'), updated_at = datetime('now','-40 days') WHERE handle = ?").run(b.account.handle);
  const c = await register(env, 'Leeg nieuw');
  // Oud profiel dat net zijn statistieken op nul zette (lege snapshots): blijft nog 30 dagen bestaan.
  const e = await register(env, 'Net gewist');
  env.DB.raw.prepare("UPDATE members SET created_at = datetime('now','-400 days') WHERE handle = ?").run(e.account.handle);
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: e.token, body: { snapshots: [], replace: true } });
  const d = await register(env, 'Inactief');
  await call(env, '/v1/me/snapshots', { method: 'PUT', token: d.token, body: { snapshots: [snap('all', 600)] } });
  env.DB.raw.prepare("UPDATE members SET updated_at = datetime('now','-800 days') WHERE handle = ?").run(d.account.handle);
  await worker.scheduled({}, env);
  const left = env.DB.raw.prepare('SELECT nickname FROM members ORDER BY nickname').all().map(x => x.nickname);
  assert.deepEqual(left, ['Actief', 'Leeg nieuw', 'Net gewist']);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM stats').get().n, 1);
  assert.ok(c);
});

test('nickname-regels en snapshotvalidatie (bestaande interne checks)', () => {
  assert.equal(internals.cleanNickname(' Senn  '), 'Senn');
  assert.equal(internals.cleanNickname('<script>'), null);
  assert.equal(internals.snapshotOkay(snap('all', 600)), true);
  assert.equal(internals.snapshotOkay(snap('all', 600, 31)), false, 'pijlen altijd veelvoud van 3');
});

test('1.7.3: dagen op rij, badges, ontwikkeling en favoriete vak: streng gecontroleerd, in lijst en profiel', async () => {
  const env = baseEnv();
  const a = await register(env, 'Senn');
  const extra = { streak: 4, badges: 12, delta10: 3.25, favorite: 'T20' };
  let r = await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 1800, 60, extra), snap(thisWeek, 900)] } });
  assert.equal(r.status, 200, await r.text());
  const week = await (await call(env, '/v1/leaderboard?period=week')).json();
  assert.equal(week.ranking[0].streak, 4, 'weeklijst toont de reeks uit het totaal');
  assert.equal(week.ranking[0].badges, 12);
  assert.equal(week.ranking[0].favorite, 'T20');
  const profile = await (await call(env, '/v1/players/' + a.account.handle)).json();
  assert.deepEqual([profile.totals.streak, profile.totals.badges, profile.totals.delta10, profile.totals.favorite], [4, 12, 3.25, 'T20']);
  for (const bad of [{ streak: -1 }, { streak: 1.5 }, { badges: 100 }, { delta10: 500 }, { delta10: 'x' }, { favorite: 'T20;DROP' }, { favorite: 'T25' }, { favorite: 'x'.repeat(30) }]) {
    r = await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 1800, 60, { ...extra, ...bad })] } });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  // Oudere app zonder de nieuwe velden: gewoon geldig, dan een streepje (null).
  r = await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: [snap('all', 1800, 60)] } });
  assert.equal(r.status, 200);
  const t = (await (await call(env, '/v1/players/' + a.account.handle)).json()).totals;
  assert.deepEqual([t.streak, t.badges, t.delta10, t.favorite], [null, null, null, null]);
});
