// OKKIE. Club: clublogo en eigen clubtrainingen. Rechten, clubscheiding en invoercontrole. Alles fictief.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';
import { exerciseInput, resultInput, logoType } from '../src/club-extras.js';

const ORIGIN = 'https://app.okkiedarts.nl';
const API = 'https://api.okkiedarts.nl';
const PILOTS = ['proef-extra-A-1234567890', 'proef-extra-B-1234567890'];
const WED = '2026-11-04T12:00:00Z';   // woensdag 4 november 2026 (Amsterdam 13:00)
const env0 = (extra = {}) => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, CLUBS_ENABLED: 'true', REGISTRATION_ENABLED: 'false', CLUB_PILOT_CODES: PILOTS.join(','), CLUB_TEST_NOW: WED, ...extra });
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async u => { throw new Error('Onverwachte externe aanroep: ' + u); }; });
after(() => { globalThis.fetch = realFetch; });

let ip = 0;
const call = (env, path, { method = 'GET', body, raw, type, token, origin = ORIGIN } = {}) => {
  const h = { 'CF-Connecting-IP': `10.2.${ip >> 8 & 255}.${ip++ & 255}` };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (raw !== undefined) h['Content-Type'] = type;
  return worker.fetch(new Request(API + path, { method, headers: h, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) }), env);
};
const ok = async (res, status = 200) => { const b = await res.json(); assert.equal(res.status, status, JSON.stringify(b)); return b; };
const status = async res => { await res.arrayBuffer(); return res.status; };
const at = (env, now) => ({ ...env, CLUB_TEST_NOW: now });

async function founder(env, nickname, pilot, name) {
  const acc = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, clubFounder: true, age: 'adult' } }), 201);
  const club = (await ok(await call(env, '/v1/clubs', { method: 'POST', token: acc.token, body: { name, consent: true } }), 201)).club;
  return { ...acc, club };
}
async function joiner(env, nickname, admin) {
  const code = admin.club.inviteCode;
  const acc = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, clubCode: code, age: 'adult' } }), 201);
  await ok(await call(env, '/v1/clubs/join', { method: 'POST', token: acc.token, body: { code, consent: true } }), 201);
  await ok(await call(env, `/v1/clubs/${admin.club.id}/requests/${acc.account.handle}`, { method: 'POST', token: admin.token, body: { approve: true } }));
  return acc;
}
// Club A met team 1 (captain Cas, lid Tim) en team 2 (lid Uma), los lid Lot; club B met beheerder Bram.
async function setup(env = env0()) {
  const a = await founder(env, 'Anja', PILOTS[0], 'DC De Pijl');
  const b = await founder(env, 'Bram', PILOTS[1], 'Darts Oost');
  const [cas, tim, uma, lot] = [await joiner(env, 'Cas', a), await joiner(env, 'Tim', a), await joiner(env, 'Uma', a), await joiner(env, 'Lot', a)];
  const A = a.club.id;
  const t1 = (await ok(await call(env, `/v1/clubs/${A}/teams`, { method: 'POST', token: a.token, body: { name: 'Team 1' } }), 201)).team;
  const t2 = (await ok(await call(env, `/v1/clubs/${A}/teams`, { method: 'POST', token: a.token, body: { name: 'Team 2' } }), 201)).team;
  await ok(await call(env, `/v1/clubs/${A}/teams/${t1.id}`, { method: 'PATCH', token: a.token, body: { captain: cas.account.handle } }));
  for (const [acc, t] of [[cas, t1], [tim, t1], [uma, t2]]) await ok(await call(env, `/v1/clubs/${A}/members/${acc.account.handle}`, { method: 'PATCH', token: a.token, body: { teamId: t.id } }));
  return { env, a, b, cas, tim, uma, lot, A, t1, t2 };
}
const ex = (extra = {}) => ({ name: '60 pijlen scoren', description: 'Gooi 60 pijlen op de 20.', kind: 'score', darts: 60, startsOn: '2026-11-02', endsOn: '2026-11-15', ...extra });
const jpeg = (n = 2000) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
const png = (w = 256, h = 256, n = 3000) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  b.set([w >>> 24, w >>> 16 & 255, w >>> 8 & 255, w & 255, h >>> 24, h >>> 16 & 255, h >>> 8 & 255, h & 255], 16); return b; };

test('logo: beheerder uploadt JPG/PNG, alleen leden van die club zien het, standaard geen logo', async () => {
  const { env, a, b, lot, A } = await setup();
  assert.equal((await ok(await call(env, `/v1/clubs/${A}`, { token: lot.token }))).club.logo, null, 'zonder logo: app toont standaardlogo');
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`, { token: lot.token })), 404);
  await ok(await call(env, `/v1/clubs/${A}/logo`, { method: 'PUT', token: a.token, raw: jpeg(), type: 'image/jpeg' }));
  const res = await call(env, `/v1/clubs/${A}/logo`, { token: lot.token });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/jpeg');
  assert.match(res.headers.get('Cache-Control'), /private/);
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer()).slice(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok((await ok(await call(env, `/v1/clubs/${A}`, { token: lot.token }))).club.logo);
  // Ander clubbestuur, gewone leden, geen token: niets.
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`, { token: b.token })), 404);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`)), 401);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`, { method: 'PUT', token: b.token, raw: jpeg(), type: 'image/jpeg' })), 404);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`, { method: 'PUT', token: lot.token, raw: jpeg(), type: 'image/jpeg' })), 403);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`, { method: 'DELETE', token: lot.token })), 403);
  // PNG vervangt, daarna verwijderen.
  await ok(await call(env, `/v1/clubs/${A}/logo`, { method: 'PUT', token: a.token, raw: png(), type: 'image/png' }));
  assert.equal((await call(env, `/v1/clubs/${A}/logo`, { token: lot.token })).headers.get('Content-Type'), 'image/png');
  await ok(await call(env, `/v1/clubs/${A}/logo`, { method: 'DELETE', token: a.token }));
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`, { token: lot.token })), 404);
});

test('logo: alleen echte JPG/PNG, klein, juiste soort; club opheffen wist het logo', async () => {
  const { env, a, A } = await setup();
  const put = (raw, type) => call(env, `/v1/clubs/${A}/logo`, { method: 'PUT', token: a.token, raw, type });
  assert.equal(await status(await put(new TextEncoder().encode('<svg onload=alert(1)>'), 'image/png')), 415, 'SVG/tekst als PNG');
  assert.equal(await status(await put(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0]), 'image/gif')), 415, 'GIF');
  assert.equal(await status(await put(jpeg(), 'image/png')), 415, 'JPG met verkeerde soort');
  assert.equal(await status(await put(jpeg(200_001), 'image/jpeg')), 413, 'te groot');
  assert.equal(await status(await put(png(4000, 4000), 'image/png')), 415, 'PNG te groot in pixels');
  assert.equal(await status(await call(env, `/v1/clubs/${A}/logo`, { method: 'PUT', token: a.token, raw: jpeg(), type: 'image/jpeg', origin: 'https://kwaad.example' })), 403);
  await ok(await put(jpeg(), 'image/jpeg'));
  await ok(await call(env, `/v1/clubs/${A}`, { method: 'DELETE', token: a.token }));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM club_logos').get().n, 0);
  assert.equal(logoType(png(512, 512)), 'image/png');
  assert.equal(logoType(png(513, 10)), null);
});

test('clubnaam: alleen de beheerder wijzigt hem, met dezelfde naamcontrole', async () => {
  const { env, a, lot, A } = await setup();
  assert.equal(await status(await call(env, `/v1/clubs/${A}`, { method: 'PATCH', token: lot.token, body: { name: 'Overgenomen' } })), 403);
  for (const name of ['', 'x', '<script>', 'a'.repeat(41)]) assert.equal(await status(await call(env, `/v1/clubs/${A}`, { method: 'PATCH', token: a.token, body: { name } })), 400, name);
  await ok(await call(env, `/v1/clubs/${A}`, { method: 'PATCH', token: a.token, body: { name: 'DC De Pijl 1985' } }));
  assert.equal((await ok(await call(env, `/v1/clubs/${A}`, { token: lot.token }))).club.name, 'DC De Pijl 1985');
});

test('clubtraining maken: beheerder (club of team), captain alleen voor zijn eigen team, lid en andere club niet', async () => {
  const { env, a, b, cas, tim, A, t1, t2 } = await setup();
  const post = (acc, body) => call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: acc.token, body });
  await ok(await post(a, ex()), 201);
  await ok(await post(a, ex({ name: 'Team 2 klok', kind: 'clock', darts: undefined, teamId: t2.id })), 201);
  await ok(await post(cas, ex({ name: 'Doubles team 1', kind: 'target', darts: 30, target: 'D16', teamId: t1.id })), 201);
  assert.equal(await status(await post(cas, ex({ name: 'Clubbreed' }))), 403, 'captain: niet voor de hele club');
  assert.equal(await status(await post(cas, ex({ name: 'Ander team', teamId: t2.id }))), 403, 'captain: niet voor een ander team');
  assert.equal(await status(await post(tim, ex({ name: 'Lid', teamId: t1.id }))), 403, 'lid: nooit');
  assert.equal(await status(await post(b, ex())), 404, 'andere club: bestaat niet');
  assert.equal(await status(await post(a, ex({ teamId: '0'.repeat(32) }))), 404, 'onbekend team');
  // Team van club B kan niet in club A gebruikt worden.
  const bt = (await ok(await call(env, `/v1/clubs/${b.club.id}/teams`, { method: 'POST', token: b.token, body: { name: 'B-team' } }), 201)).team;
  assert.equal(await status(await post(a, ex({ teamId: bt.id }))), 404);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM club_exercises WHERE club_id = ?').get(A).n, 3);
});

test('clubtraining: invoercontrole', () => {
  const today = '2026-11-04';
  const bad = [
    [{ name: 'x' }, /naam/], [{ name: '<b>Vet</b>' }, /naam/], [{ description: 'a'.repeat(201) }, /uitleg/], [{ description: 'klik <a href=x>' }, /uitleg/],
    [{ kind: 'bowling' }, /type/], [{ darts: 61 }, /veelvoud/], [{ darts: 6 }, /veelvoud/], [{ darts: 303 }, /veelvoud/],
    [{ kind: 'target', darts: 30, target: 'D21' }, /doelvak/], [{ kind: 'target', darts: 30, target: 'X16' }, /doelvak/],
    [{ kind: 'checkout', checkouts: [] }, /Checkout/], [{ kind: 'checkout', checkouts: [40, 169] }, /Checkout/], [{ kind: 'checkout', checkouts: [1] }, /Checkout/],
    [{ kind: 'checkout', checkouts: Array(11).fill(40) }, /Checkout/], [{ startsOn: '2026-02-30' }, /datum/], [{ endsOn: '15-11-2026' }, /datum/],
    [{ startsOn: '2026-11-10', endsOn: '2026-11-09' }, /vóór/], [{ startsOn: '2026-10-01', endsOn: '2026-11-03' }, /verleden/],
    [{ startsOn: '2026-11-04', endsOn: '2026-12-30' }, /56 dagen/],
  ];
  for (const [patch, msg] of bad) assert.match(exerciseInput(ex(patch), today).error || '', msg, JSON.stringify(patch));
  assert.deepEqual(exerciseInput(ex({ kind: 'checkout', darts: undefined, checkouts: [40, 81, 121, 170] }), today).ok.checkouts, [40, 81, 121, 170]);
  assert.equal(exerciseInput(ex({ kind: 'target', darts: 3, target: 'DB' }), today).ok.target, 'DB');
  assert.equal(exerciseInput(ex({ kind: 'clock', darts: undefined }), today).ok.darts, null);
});

test('clubscheiding en teamzichtbaarheid: andere club ziet niets; teamtraining alleen voor dat team, captain en beheerder', async () => {
  const { env, a, b, cas, tim, uma, lot, A, t1 } = await setup();
  const club = (await ok(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: a.token, body: ex() }), 201)).exercise;
  const team = (await ok(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: cas.token, body: ex({ name: 'Alleen team 1', teamId: t1.id }) }), 201)).exercise;
  for (const [method, path, body] of [['GET', '/exercises'], ['GET', `/exercises/${club.id}`], ['POST', `/exercises/${club.id}/results`, { darts: 60, points: 1200 }],
    ['DELETE', `/exercises/${club.id}`], ['DELETE', `/exercises/${club.id}/results/${a.account.handle}`], ['POST', '/exercises', ex()]]) {
    const res = await call(env, `/v1/clubs/${A}${path}`, { method, token: b.token, body });
    assert.equal(res.status, 404, `andere club: ${method} ${path}`);
    assert.doesNotMatch(await res.text(), /60 pijlen|Alleen team/);
  }
  // Oefening-ID van club A via club B: bestaat niet.
  assert.equal(await status(await call(env, `/v1/clubs/${b.club.id}/exercises/${club.id}`, { token: b.token })), 404);
  const names = async acc => (await ok(await call(env, `/v1/clubs/${A}/exercises`, { token: acc.token }))).exercises.map(e => e.name).sort();
  assert.deepEqual(await names(tim), ['60 pijlen scoren', 'Alleen team 1']);
  assert.deepEqual(await names(uma), ['60 pijlen scoren'], 'ander team ziet de teamtraining niet');
  assert.deepEqual(await names(lot), ['60 pijlen scoren'], 'lid zonder team ziet hem niet');
  assert.deepEqual(await names(a), ['60 pijlen scoren', 'Alleen team 1'], 'beheerder ziet alles');
  assert.equal(await status(await call(env, `/v1/clubs/${A}/exercises/${team.id}`, { token: uma.token })), 404);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/exercises/${team.id}/results`, { method: 'POST', token: uma.token, body: { darts: 60, points: 900 } })), 404);
  // Beheerder ziet de teamtraining wel, maar doet niet mee als hij niet in het team zit.
  assert.equal(await status(await call(env, `/v1/clubs/${A}/exercises/${team.id}/results`, { method: 'POST', token: a.token, body: { darts: 60, points: 900 } })), 403);
});

test('resultaten: per type gecontroleerd, beste telt, eigen ranglijst; open van startdatum tot einddatum 22:00', async () => {
  const { env, a, cas, tim, uma, A } = await setup();
  const make = async body => (await ok(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: a.token, body }), 201)).exercise;
  const score = await make(ex());
  const clock = await make(ex({ name: 'Klok', kind: 'clock', darts: undefined }));
  const target = await make(ex({ name: 'D16', kind: 'target', darts: 30, target: 'D16' }));
  const co = await make(ex({ name: 'Checkouts', kind: 'checkout', darts: undefined, checkouts: [40, 81, 121] }));
  const send = (e, acc, body, envX = env) => call(envX, `/v1/clubs/${A}/exercises/${e.id}/results`, { method: 'POST', token: acc.token, body });
  await ok(await send(score, tim, { trainingId: 't1', darts: 60, points: 1500 }), 201);
  assert.equal((await ok(await send(score, tim, { trainingId: 't2', darts: 60, points: 1400 }), 201)).best, false);
  await ok(await send(score, uma, { trainingId: 't3', darts: 60, points: 1600 }), 201);
  for (const body of [{ darts: 30, points: 900 }, { darts: 60, points: 3601 }, { darts: 60, points: -1 }, { darts: 60, points: 1.5 }, { trainingId: '../x', darts: 60, points: 900 }])
    assert.equal(await status(await send(score, tim, body)), 400, JSON.stringify(body));
  await ok(await send(clock, tim, { darts: 40 }), 201); await ok(await send(clock, uma, { darts: 33 }), 201); await ok(await send(clock, cas, { darts: 50 }), 201);
  assert.equal(await status(await send(clock, tim, { darts: 20 })), 400);
  await ok(await send(target, tim, { hits: 7 }), 201); await ok(await send(target, cas, { hits: 9 }), 201);
  assert.equal(await status(await send(target, tim, { hits: 31 })), 400);
  await ok(await send(co, tim, { hits: 2 }), 201);
  assert.equal(await status(await send(co, tim, { hits: 4 })), 400);
  const rank = async e => (await ok(await call(env, `/v1/clubs/${A}/exercises/${e.id}`, { token: a.token }))).ranking.map(r => [r.nickname, r.value]);
  assert.deepEqual(await rank(score), [['Uma', 1600], ['Tim', 1500]]);
  assert.deepEqual(await rank(clock), [['Uma', 33], ['Tim', 40], ['Cas', 50]], 'rond de klok: minder pijlen is beter');
  assert.deepEqual(await rank(target), [['Cas', 9], ['Tim', 7]]);
  assert.equal((await ok(await call(env, `/v1/clubs/${A}/exercises/${target.id}`, { token: a.token }))).ranking[0].manual, true, 'zelf ingevoerd is zichtbaar');
  // Tijd: einddatum 15 november, 22:00 Amsterdam (CET = UTC+1).
  assert.equal(await status(await send(score, cas, { darts: 60, points: 1000 }, at(env, '2026-11-15T20:59:00Z'))), 201);
  assert.equal(await status(await send(score, cas, { darts: 60, points: 1700 }, at(env, '2026-11-15T21:00:00Z'))), 409);
  const later = await make(ex({ name: 'Later', startsOn: '2026-11-10', endsOn: '2026-11-20' }));
  const r = await send(later, tim, { darts: 60, points: 900 });
  assert.equal(r.status, 409); assert.match((await r.json()).error, /nog niet begonnen/);
});

test('verwijderen: beheerder of captain van het team; verlaten wist ook clubtrainingsresultaten; limiet lopende trainingen', async () => {
  const { env, a, cas, tim, A, t1 } = await setup();
  const team = (await ok(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: cas.token, body: ex({ name: 'Team', teamId: t1.id }) }), 201)).exercise;
  const club = (await ok(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: a.token, body: ex() }), 201)).exercise;
  await ok(await call(env, `/v1/clubs/${A}/exercises/${club.id}/results`, { method: 'POST', token: tim.token, body: { darts: 60, points: 900 } }), 201);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/exercises/${club.id}`, { method: 'DELETE', token: cas.token })), 403, 'captain: geen clubbrede training');
  assert.equal(await status(await call(env, `/v1/clubs/${A}/exercises/${team.id}`, { method: 'DELETE', token: tim.token })), 403);
  await ok(await call(env, `/v1/clubs/${A}/exercises/${team.id}`, { method: 'DELETE', token: cas.token }));
  await ok(await call(env, `/v1/clubs/${A}/me`, { method: 'DELETE', token: tim.token }));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM club_exercise_results').get().n, 0, 'verlaten wist ook clubtrainingsresultaten');
  for (let i = 0; i < 9; i++) await ok(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: a.token, body: ex({ name: 'Extra ' + i }) }), 201);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: a.token, body: ex({ name: 'Te veel' }) })), 409);
});

test('functievlag uit: logo en clubtrainingen bestaan niet', async () => {
  const { env, a, A } = await setup();
  const off = { ...env, CLUBS_ENABLED: 'false' };
  assert.equal(await status(await call(off, `/v1/clubs/${A}/logo`, { token: a.token })), 404);
  assert.equal(await status(await call(off, `/v1/clubs/${A}/exercises`, { token: a.token })), 404);
  assert.equal(resultInput({ kind: 'score', darts: 30 }, { darts: 30, points: 900 }).manual, 1);
});

test('moderatie in de besloten inbox: nieuwe clubs zichtbaar, logo/naam/training/club verwijderen; alleen met sleutel en vanaf de inbox zelf', async () => {
  const KEY = 'inbox-sleutel-voor-de-test-0123456789abcdef';
  const { env, a, lot, A } = await setup(env0({ FEEDBACK_KEY: KEY }));
  await ok(await call(env, `/v1/clubs/${A}/logo`, { method: 'PUT', token: a.token, raw: jpeg(), type: 'image/jpeg' }));
  const exId = (await ok(await call(env, `/v1/clubs/${A}/exercises`, { method: 'POST', token: a.token, body: ex({ name: 'Ongepast' }) }), 201)).exercise.id;
  const admin = (path, opts = {}) => worker.fetch(new Request(API + path, { method: opts.method || 'GET', headers: { Authorization: 'Bearer ' + (opts.key ?? KEY), ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.origin !== undefined ? { Origin: opts.origin } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }), env);
  assert.equal((await admin('/v1/feedback/admin/clubs', { key: 'fout'.repeat(10) })).status, 403);
  const list = await ok(await admin('/v1/feedback/admin/clubs'));
  const club = list.clubs.find(c => c.id === A);
  assert.equal(club.name, 'DC De Pijl'); assert.equal(club.hasLogo, true); assert.equal(club.exercises[0].name, 'Ongepast');
  assert.match((await ok(await admin(`/v1/feedback/admin/club-logo?id=${A}`))).logo, /^data:image\/jpeg;base64,/);
  // Wijzigen alleen vanaf de inboxpagina (zelfde herkomst als de Worker).
  assert.equal((await admin('/v1/feedback/admin/club', { method: 'POST', origin: 'https://kwaad.example', body: { id: A, action: 'logo' } })).status, 404);
  const act = body => admin('/v1/feedback/admin/club', { method: 'POST', origin: API, body: { id: A, ...body } });
  await ok(await act({ action: 'logo' }));
  await ok(await act({ action: 'rename', name: 'Nette naam' }));
  assert.equal((await act({ action: 'rename', name: '<b>' })).status, 400);
  await ok(await act({ action: 'exercise', exerciseId: exId }));
  const after = (await ok(await call(env, `/v1/clubs/${A}`, { token: lot.token }))).club;
  assert.equal(after.name, 'Nette naam'); assert.equal(after.logo, null);
  assert.equal((await ok(await call(env, `/v1/clubs/${A}/exercises`, { token: lot.token }))).exercises.length, 0);
  await ok(await act({ action: 'delete' }));
  assert.equal(await status(await call(env, `/v1/clubs/${A}`, { token: lot.token })), 404);
});
