// Darters: openbaar overzicht, één schakelaar per speler, ouderlijke toestemming onder 16. Fictieve spelers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';
import { weekKey } from '../src/groups.js';

const ORIGIN = 'https://app.okkiedarts.nl';
const env0 = (extra = {}) => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, DARTERS_ENABLED: 'true', GROUPS_ENABLED: 'false', REGISTRATION_ENABLED: 'false', ...extra });
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async u => { throw new Error('Onverwachte externe aanroep: ' + u); }; });
after(() => { globalThis.fetch = realFetch; });
let ip = 0;
const call = (env, path, { method = 'GET', body, token } = {}) => {
  const h = { 'CF-Connecting-IP': `10.1.${ip >> 8 & 255}.${ip++ & 255}`, Origin: ORIGIN };
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return worker.fetch(new Request('https://api.example' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
};
const ok = async (res, status = 200) => { const b = await res.json(); assert.equal(res.status, status, JSON.stringify(b)); return b; };
const snaps = (points, darts, extra = {}) => [{ period: 'all', darts, points, sessions: darts / 30, highestTurn: 140, hits100: 2, hits140: 1, hits180: 0, best30: 450, best60: 880, best99: null, challenge30: 450, ...extra },
  { period: weekKey(), darts, points, sessions: darts / 30, highestTurn: 140, hits100: 2, hits140: 1, hits180: 0, best30: 450, best60: 880, best99: null, challenge30: 450, ...extra }];
const board = async env => (await ok(await call(env, '/v1/leaderboard?period=all'))).ranking;

test('iedereen ziet het overzicht; aanzetten maakt zichtbaar, uitzetten verwijdert direct; geen interne ID in het overzicht', async () => {
  const env = env0();
  assert.deepEqual(await board(env), [], 'leeg overzicht is gewoon te bekijken zonder account');
  assert.equal((await call(env, '/v1/darters/join', { method: 'POST', body: { nickname: 'x', age: 'adult' } })).status, 400);
  const a = await ok(await call(env, '/v1/darters/join', { method: 'POST', body: { nickname: 'Senn', age: 'adult' } }), 201);
  assert.equal(a.public, true);
  await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: snaps(1500, 90) } }));
  const rows = await board(env);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nickname, 'Senn');
  assert.equal(rows[0].best60, 880);
  assert.equal(rows[0].id, undefined, 'geen interne ID');
  assert.equal((await ok(await call(env, '/v1/leaderboard?period=week'))).ranking.length, 1);
  await ok(await call(env, '/v1/me', { method: 'DELETE', token: a.token }));
  assert.deepEqual(await board(env), []);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM stats').get().n, 0, 'gedeelde cijfers online gewist');
});

test('twee spelers op één telefoon zijn twee aparte profielen', async () => {
  const env = env0();
  const a = await ok(await call(env, '/v1/darters/join', { method: 'POST', body: { nickname: 'Senn', age: 'adult' } }), 201);
  const b = await ok(await call(env, '/v1/darters/join', { method: 'POST', body: { nickname: 'Senn', age: 'adult' } }), 201);   // zelfde naam
  assert.notEqual(a.account.handle, b.account.handle);
  await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: a.token, body: { snapshots: snaps(1500, 90) } }));
  await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: b.token, body: { snapshots: snaps(600, 30, { best30: 600, best60: null, challenge30: 600 }) } }));
  const rows = await board(env);
  assert.deepEqual(rows.map(r => r.points).sort((x, y) => x - y), [600, 1500]);
});

test('jonger dan 16: pas zichtbaar en pas cijfers bewaard na "ja" van een ouder; intrekken wist alles', async () => {
  const env = env0();
  const k = await ok(await call(env, '/v1/darters/join', { method: 'POST', body: { nickname: 'Noor', age: 'minor' } }), 201);
  assert.equal(k.public, false); assert.equal(k.needsParent, true); assert.match(k.consentToken, /^[a-f0-9]{64}$/);
  const w = await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: k.token, body: { snapshots: snaps(900, 60) } }));
  assert.equal(w.waitingForParent, true);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM stats').get().n, 0, 'zonder toestemming geen cijfers bewaard');
  assert.equal((await call(env, '/v1/me', { method: 'PATCH', token: k.token, body: { enabled: true } })).status, 403, 'zelf openbaar maken kan niet');
  assert.deepEqual(await board(env), []);
  // Ouder: bekijken, zonder vinkje geweigerd, daarna ja
  const p = await ok(await call(env, '/v1/darters/consent/preview', { method: 'POST', body: { token: k.consentToken } }));
  assert.equal(p.child, 'Noor'); assert.equal(p.confirmed, false);
  assert.equal((await call(env, '/v1/darters/consent/confirm', { method: 'POST', body: { token: k.consentToken } })).status, 400);
  await ok(await call(env, '/v1/darters/consent/confirm', { method: 'POST', body: { token: k.consentToken, parent: true } }));
  await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: k.token, body: { snapshots: snaps(900, 60) } }));
  assert.equal((await board(env))[0].nickname, 'Noor');
  // Koppelcode (andere telefoon) mag nu ook, zonder groepen
  await ok(await call(env, '/v1/me/guest-pass', { method: 'POST', token: k.token }), 201);
  // Ouder trekt in: profiel en cijfers weg
  await ok(await call(env, '/v1/darters/consent/withdraw', { method: 'POST', body: { token: k.consentToken } }));
  assert.deepEqual(await board(env), []);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM members').get().n, 0);
  assert.equal((await call(env, '/v1/darters/consent/preview', { method: 'POST', body: { token: k.consentToken } })).status, 404);
});

test('besloten groepsprofielen komen nooit in het openbare overzicht; Darters uit = 404', async () => {
  const env = env0({ GROUPS_ENABLED: 'true', GROUP_FOUNDER_CODE: 'oprichter-test-code-1234567890' });
  const g = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Besloten', founderCode: 'oprichter-test-code-1234567890', age: 'adult' } }), 201);
  await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: g.token, body: { snapshots: snaps(1800, 90) } }));
  assert.deepEqual(await board(env), []);
  assert.equal((await call(env, '/v1/players/' + g.account.handle)).status, 404);
  assert.equal((await call(env0({ DARTERS_ENABLED: undefined }), '/v1/darters/join', { method: 'POST', body: { nickname: 'Senn', age: 'adult' } })).status, 404);
});
