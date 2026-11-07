// OKKIE. Club bij het bord (migratie 0012): bordcode (QR bij het dartbord) en persoonlijke uitnodiging, vernieuwen en
// ongeldig maken, direct meedoen of eerst goedkeuren, automatisch meetellen. Alle namen en codes zijn fictief.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';
import { CODE_LIMITS } from '../src/clubs.js';

const ORIGIN = 'https://app.okkiedarts.nl';
const WED = '2026-11-04T12:00:00Z';
const env0 = () => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, CLUBS_ENABLED: 'true', REGISTRATION_ENABLED: 'false', CLUB_TEST_NOW: WED });
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async u => { throw new Error('Onverwachte externe aanroep: ' + u); }; });
after(() => { globalThis.fetch = realFetch; });

let ip = 0;
const call = (env, path, { method = 'GET', body, token } = {}) => {
  const h = { 'CF-Connecting-IP': `10.2.${ip >> 8 & 255}.${ip++ & 255}`, Origin: ORIGIN };
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return worker.fetch(new Request('https://api.okkiedarts.nl' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
};
const ok = async (res, status = 200) => { const b = await res.json(); assert.equal(res.status, status, JSON.stringify(b)); return b; };
const status = async res => { await res.text(); return res.status; };
const register = async (env, nickname, extra) => (await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, age: 'adult', ...extra } }), 201));
async function founder(env, name = 'Kantine De Roos') {
  const acc = await register(env, 'Anja', { clubFounder: true });
  const club = (await ok(await call(env, '/v1/clubs', { method: 'POST', token: acc.token, body: { name, consent: true } }), 201)).club;
  return { ...acc, club };
}
const join = (env, acc, code) => call(env, '/v1/clubs/join', { method: 'POST', token: acc.token, body: { code, consent: true } });
const preview = (env, code) => call(env, '/v1/clubs/preview', { method: 'POST', body: { code } });
const clubOf = async (env, a, id = a.club.id) => ok(await call(env, `/v1/clubs/${id}`, { token: a.token }));

test('nieuwe club: één hoofd-bordcode, gelijk aan inviteCode, standaard met goedkeuring (zoals 1.10.0)', async () => {
  const env = env0();
  const a = await founder(env);
  const c = await clubOf(env, a);
  assert.equal(c.club.codes.length, 1);
  assert.deepEqual({ ...c.club.codes[0], createdAt: undefined }, { code: a.club.inviteCode, kind: 'board', label: '', direct: false, teamId: null, maxUses: null, uses: 0, expiresAt: null, createdAt: undefined, primary: true });
  const p = await register(env, 'Piet', { clubCode: a.club.inviteCode });
  assert.equal((await ok(await join(env, p, a.club.inviteCode), 201)).status, 'pending');
});

test('bordcode met "direct meedoen": scannen = meteen lid, scores tellen direct mee; uitzetten = weer goedkeuren', async () => {
  const env = env0();
  const a = await founder(env);
  await ok(await call(env, `/v1/clubs/${a.club.id}/challenge`, { method: 'PUT', token: a.token, body: { kind: 'score30' } }));
  await ok(await call(env, `/v1/clubs/${a.club.id}/codes/${a.club.inviteCode}`, { method: 'PATCH', token: a.token, body: { direct: true, label: 'Bord 1 kantine' } }));
  const pv = await ok(await preview(env, a.club.inviteCode));
  assert.deepEqual(pv.code, { kind: 'board', direct: true, label: 'Bord 1 kantine' });
  const p = await register(env, 'Piet', { clubCode: a.club.inviteCode });
  const j = await ok(await join(env, p, a.club.inviteCode), 201);
  assert.deepEqual(j, { club: { id: a.club.id, name: 'Kantine De Roos' }, status: 'active' });
  // Automatisch meetellen: past bij de weekoefening → ranglijst + feed; past niet → alleen feed, geen fout.
  const auto = (trainingId, kind, darts, points) => call(env, `/v1/clubs/${a.club.id}/trainings`, { method: 'POST', token: p.token, body: { training: { trainingId, kind, darts, points, high: 60 }, feed: true, challenge: 'auto' } });
  assert.deepEqual(await ok(await auto('t1', 'score30', 30, 600), 201), { challenge: { best: true, value: 600 }, feed: true });
  assert.deepEqual(await ok(await auto('t2', 'score60', 60, 1500), 201), { feed: true });
  const week = await ok(await call(env, `/v1/clubs/${a.club.id}/challenge`, { token: p.token }));
  assert.deepEqual(week.ranking.map(r => [r.nickname, r.value]), [['Piet', 600]]);
  const feed = await ok(await call(env, `/v1/clubs/${a.club.id}/feed`, { token: p.token }));
  assert.equal(feed.feed.length, 2);
  // Weer met goedkeuring.
  await ok(await call(env, `/v1/clubs/${a.club.id}/codes/${a.club.inviteCode}`, { method: 'PATCH', token: a.token, body: { direct: false } }));
  const q = await register(env, 'Quinten', { clubCode: a.club.inviteCode });
  assert.equal((await ok(await join(env, q, a.club.inviteCode), 201)).status, 'pending');
});

test('wachtend lid met directe code of persoonlijke uitnodiging wordt alsnog meteen lid', async () => {
  const env = env0();
  const a = await founder(env);
  const p = await register(env, 'Piet', { clubCode: a.club.inviteCode });
  assert.equal((await ok(await join(env, p, a.club.inviteCode), 201)).status, 'pending');
  const inv = (await ok(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'personal', label: 'Piet' } }), 201)).code;
  assert.equal((await ok(await join(env, p, inv.code), 201)).status, 'active');
  assert.equal((await clubOf(env, a)).club.pending, 0);
});

test('persoonlijke uitnodiging: 10 tekens, één keer bruikbaar, 14 dagen geldig, intrekken maakt hem ongeldig', async () => {
  const env = env0();
  const a = await founder(env);
  const inv = (await ok(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'personal', label: '  Jan   de Vries <b>' } }), 201)).code;
  assert.match(inv.code, /^[A-HJKMNP-Z2-9]{10}$/);
  assert.equal(inv.label, 'Jan de Vries b');
  const days = (Date.parse(inv.expiresAt.replace(' ', 'T') + 'Z') - Date.now()) / 864e5;
  assert.ok(days > CODE_LIMITS.personalDays - 1 && days <= CODE_LIMITS.personalDays + 0.01, 'verloopt na 14 dagen: ' + inv.expiresAt);
  assert.deepEqual((await ok(await preview(env, inv.code))).code, { kind: 'personal', direct: true, label: 'Jan de Vries b' });
  // Registreren met de persoonlijke code mag (zoals met een bordcode).
  const jan = await register(env, 'Jan', { clubCode: inv.code });
  assert.equal((await ok(await join(env, jan, inv.code), 201)).status, 'active');
  // Tweede gebruik: bestaat niet meer.
  const kees = await register(env, 'Kees', { clubCode: a.club.inviteCode });
  assert.equal(await status(await join(env, kees, inv.code)), 404);
  assert.equal(await status(await preview(env, inv.code)), 404);
  assert.equal(await status(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Xander', age: 'adult', clubCode: inv.code } })), 403);
  assert.equal((await clubOf(env, a)).club.codes.filter(c => c.kind === 'personal').length, 0, 'gebruikte uitnodiging staat niet meer in de lijst');
  // Intrekken vóór gebruik.
  const inv2 = (await ok(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'personal' } }), 201)).code;
  await ok(await call(env, `/v1/clubs/${a.club.id}/codes/${inv2.code}`, { method: 'DELETE', token: a.token }));
  assert.equal(await status(await join(env, kees, inv2.code)), 404);
  // Verlopen.
  const inv3 = (await ok(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'personal' } }), 201)).code;
  env.DB.raw.prepare("UPDATE club_codes SET expires_at = datetime('now', '-1 minute') WHERE code = ?").run(inv3.code);
  assert.equal(await status(await join(env, kees, inv3.code)), 404);
});

test('vernieuwen: oude bordcode (en dus de oude QR-poster) werkt direct niet meer; instellingen blijven; 1.10.0-route /code ook', async () => {
  const env = env0();
  const a = await founder(env);
  const old = a.club.inviteCode;
  await ok(await call(env, `/v1/clubs/${a.club.id}/codes/${old}`, { method: 'PATCH', token: a.token, body: { direct: true, label: 'Kantine' } }));
  const r = await ok(await call(env, `/v1/clubs/${a.club.id}/codes/${old}/renew`, { method: 'POST', token: a.token }));
  assert.notEqual(r.code, old);
  assert.equal(r.primary, true);
  const p = await register(env, 'Piet', { clubCode: r.code });
  assert.equal(await status(await preview(env, old)), 404);
  assert.equal(await status(await join(env, p, old)), 404);
  assert.equal(await status(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Xander', age: 'adult', clubCode: old } })), 403);
  const c = await clubOf(env, a);
  assert.equal(c.club.inviteCode, r.code, 'inviteCode (voor oudere apps) volgt de hoofdcode');
  assert.deepEqual(c.club.codes.map(x => [x.code, x.label, x.direct, x.primary]), [[r.code, 'Kantine', true, true]]);
  assert.equal((await ok(await join(env, p, r.code), 201)).status, 'active');
  // Oude route van 1.10.0.
  const { inviteCode } = await ok(await call(env, `/v1/clubs/${a.club.id}/code`, { method: 'POST', token: a.token }));
  assert.equal(await status(await preview(env, r.code)), 404);
  assert.equal((await ok(await preview(env, inviteCode))).code.direct, true);
});

test('meer borden of groepen (voorbereid): extra bordcode met label en team; hoofdcode kan niet weg; grenzen', async () => {
  const env = env0();
  const a = await founder(env);
  const team = (await ok(await call(env, `/v1/clubs/${a.club.id}/teams`, { method: 'POST', token: a.token, body: { name: 'Jeugd' } }), 201)).team;
  const extra = (await ok(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'board', label: 'Bord 2 bovenzaal', teamId: team.id, direct: true } }), 201)).code;
  assert.match(extra.code, /^[A-HJKMNP-Z2-9]{8}$/);
  const p = await register(env, 'Piet', { clubCode: extra.code });
  await ok(await join(env, p, extra.code), 201);
  const c = await clubOf(env, a);
  assert.equal(c.members.find(m => m.nickname === 'Piet').teamId, team.id, 'via de jeugdcode meteen in het team');
  assert.deepEqual(c.club.codes.map(x => [x.label, x.primary]), [['', true], ['Bord 2 bovenzaal', false]]);
  assert.equal(c.club.codes[1].uses, 1);
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}/codes/${a.club.inviteCode}`, { method: 'DELETE', token: a.token })), 409);
  await ok(await call(env, `/v1/clubs/${a.club.id}/codes/${extra.code}`, { method: 'DELETE', token: a.token }));
  assert.equal(await status(await preview(env, extra.code)), 404);
  for (let i = 1; i < CODE_LIMITS.boardCodes; i++) await ok(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'board' } }), 201);
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'board' } })), 409);
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}/codes`, { method: 'POST', token: a.token, body: { kind: 'iets' } })), 400);
});

test('alleen de beheerder van déze club beheert codes; leden en andere clubs krijgen 403/404', async () => {
  const env = env0();
  const a = await founder(env);
  await ok(await call(env, `/v1/clubs/${a.club.id}/codes/${a.club.inviteCode}`, { method: 'PATCH', token: a.token, body: { direct: true } }));
  const p = await register(env, 'Piet', { clubCode: a.club.inviteCode });
  await ok(await join(env, p, a.club.inviteCode), 201);
  for (const [path, method, body] of [['/codes', 'GET'], ['/codes', 'POST', { kind: 'personal' }], [`/codes/${a.club.inviteCode}`, 'PATCH', { direct: false }], [`/codes/${a.club.inviteCode}/renew`, 'POST'], ['/code', 'POST']])
    assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}${path}`, { method, token: p.token, body })), 403, path);
  assert.equal((await clubOf(env, p, a.club.id)).club.codes, undefined, 'leden zien geen codes');
  const b = { ...(await register(env, 'Bram', { clubFounder: true })) };
  b.club = (await ok(await call(env, '/v1/clubs', { method: 'POST', token: b.token, body: { name: 'Andere club', consent: true } }), 201)).club;
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}/codes`, { token: b.token })), 404);
  assert.equal(await status(await call(env, `/v1/clubs/${b.club.id}/codes/${a.club.inviteCode}`, { method: 'DELETE', token: b.token })), 404, 'code van een andere club');
});

test('migratie 0012: bestaande clubs houden hun code (met goedkeuring); vangnet voor een club zonder coderij', async () => {
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) if (f < '0012') db.exec(readFileSync(dir + f, 'utf8'));
  const t = '2026-11-01 10:00:00';
  db.exec(`INSERT INTO members(id, handle, nickname, token_hash, recovery_hash, created_at, updated_at) VALUES ('m1','aaaaaaaaaaaa','Ann','h1','r1','${t}','${t}')`);
  db.exec(`INSERT INTO clubs(id, name, invite_code, created_by, created_at, updated_at) VALUES ('c1','Club A','AAAAAAAA','m1','${t}','${t}'), ('c2','Club B','BBBBBBBB','m1','${t}','${t}')`);
  db.exec(readFileSync(dir + '0012_club_codes.sql', 'utf8'));
  assert.deepEqual(db.prepare('SELECT code, club_id, kind, auto_approve, max_uses, expires_at FROM club_codes ORDER BY code').all().map(r => ({ ...r })),
    [{ code: 'AAAAAAAA', club_id: 'c1', kind: 'board', auto_approve: 0, max_uses: null, expires_at: null }, { code: 'BBBBBBBB', club_id: 'c2', kind: 'board', auto_approve: 0, max_uses: null, expires_at: null }]);
  // Nogmaals uitvoeren (bijv. opnieuw toegepast) geeft geen fout of dubbele rijen.
  db.exec(readFileSync(dir + '0012_club_codes.sql', 'utf8'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM club_codes').get().n, 2);
  // Club die de oude Worker vlak na de migratie aanmaakte (geen rij in club_codes): code werkt toch.
  const env = env0();
  const a = await founder(env);
  env.DB.raw.prepare('DELETE FROM club_codes WHERE club_id = ?').run(a.club.id);
  assert.equal((await ok(await preview(env, a.club.inviteCode))).club.name, 'Kantine De Roos');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM club_codes WHERE club_id = ?').get(a.club.id).n, 1);
});
