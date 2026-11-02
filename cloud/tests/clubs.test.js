// OKKIE. Club: integratietests op echte SQLite (node:sqlite). Kern: club A ziet NOOIT gegevens van club B.
// Alle namen, codes en scores zijn fictief.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';
import { weekKey } from '../src/groups.js';
import { clubWeek, weekOpen, closesAt, amsterdam, trainingOkay, normalizeCode, newInviteCode } from '../src/clubs.js';

const ORIGIN = 'https://app.okkiedarts.nl';
const API = 'https://api.okkiedarts.nl';
const PILOTS = ['proefclub-code-A-1234567890', 'proefclub-code-B-1234567890', 'proefclub-code-C-1234567890'];
const WED = '2026-11-04T12:00:00Z';   // woensdag; week van maandag 2 november 2026
const env0 = (extra = {}) => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, CLUBS_ENABLED: 'true', REGISTRATION_ENABLED: 'false',
  CLUB_PILOT_CODES: PILOTS.join(','), CLUB_TEST_NOW: WED, ...extra });

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async u => { throw new Error('Onverwachte externe aanroep: ' + u); }; });
after(() => { globalThis.fetch = realFetch; });

let ip = 0;
const call = (env, path, { method = 'GET', body, token, origin = ORIGIN } = {}) => {
  const h = { 'CF-Connecting-IP': `10.1.${ip >> 8 & 255}.${ip++ & 255}` };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return worker.fetch(new Request(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
};
const ok = async (res, status = 200) => { const b = await res.json(); assert.equal(res.status, status, JSON.stringify(b)); return b; };
const status = async res => { await res.text(); return res.status; };
const at = (env, now) => ({ ...env, CLUB_TEST_NOW: now });

async function founder(env, nickname, pilot, clubName) {
  const acc = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, clubFounder: true, age: 'adult' } }), 201);
  const club = (await ok(await call(env, '/v1/clubs', { method: 'POST', token: acc.token, body: { name: clubName, consent: true } }), 201)).club;
  return { ...acc, club };
}
async function joiner(env, nickname, code, admin, clubId, approve = true) {
  const acc = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, clubCode: code, age: 'adult' } }), 201);
  await ok(await call(env, '/v1/clubs/join', { method: 'POST', token: acc.token, body: { code, consent: true } }), 201);
  if (approve) await ok(await call(env, `/v1/clubs/${clubId}/requests/${acc.account.handle}`, { method: 'POST', token: admin.token, body: { approve: true } }));
  return acc;
}
const training = (trainingId, kind, darts, points, high = 100) => ({ trainingId, kind, darts, points, high });
const share = (env, acc, clubId, t, { feed = true, challenge = true } = {}) =>
  call(env, `/v1/clubs/${clubId}/trainings`, { method: 'POST', token: acc.token, body: { training: t, feed, challenge } });
const snap = (period, points, darts = 90) => ({ period, darts, points, sessions: darts / 30, highestTurn: 100, hits100: 1, hits140: 0, hits180: 0, best30: null, challenge30: null });

// Twee clubs met elk een beheerder, captain en leden; één speler zit in beide clubs.
async function twoClubs(env = env0()) {
  const a = await founder(env, 'Anja', PILOTS[0], 'DC De Pijl');
  const b = await founder(env, 'Bram', PILOTS[1], 'Darts Oost');
  const a1 = await joiner(env, 'Alex', a.club.inviteCode, a, a.club.id);
  const a2 = await joiner(env, 'Amira', a.club.inviteCode, a, a.club.id);
  const b1 = await joiner(env, 'Bas', b.club.inviteCode, b, b.club.id);
  const both = await joiner(env, 'Dubbel', a.club.inviteCode, a, a.club.id);
  await ok(await call(env, '/v1/clubs/join', { method: 'POST', token: both.token, body: { code: b.club.inviteCode, consent: true } }), 201);
  await ok(await call(env, `/v1/clubs/${b.club.id}/requests/${both.account.handle}`, { method: 'POST', token: b.token, body: { approve: true } }));
  // Zonder vaste testtijd (echte klok) kan de week net gesloten zijn (zondag na 22:00): dan de oefening voor volgende week.
  const real = !env.CLUB_TEST_NOW, closed = real && !weekOpen(clubWeek(new Date()), new Date());
  for (const [admin, kind] of [[a, 'score30'], [b, 'score30']])
    await ok(await call(env, `/v1/clubs/${admin.club.id}/challenge`, { method: 'PUT', token: admin.token, body: { kind, ...(closed ? { week: 'next' } : {}) } }));
  return { env, a, b, a1, a2, b1, both };
}

test('functievlag standaard uit: zonder CLUBS_ENABLED="true" bestaat Club niet en kan niemand zich via een clubcode registreren', async () => {
  for (const v of [undefined, 'false', 'TRUE', '1', 'yes']) {
    const env = env0({ CLUBS_ENABLED: v });
    assert.equal(await status(await call(env, '/v1/clubs')), 404);
    assert.equal(await status(await call(env, '/v1/clubs/preview', { method: 'POST', body: { code: 'ABCDEFGH' } })), 404);
    assert.equal(await status(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Test', clubFounder: true, age: 'adult' } })), 403);
    assert.equal(await status(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Test', clubCode: 'ABCDEFGH', age: 'adult' } })), 403);
    assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM members').get().n, 0);
    assert.equal((await (await call(env, '/v1/health')).json()).clubs, false);
  }
  assert.equal((await (await call(env0(), '/v1/health')).json()).clubs, true);
});

test('oprichten: iedereen van 16+ zonder code; misbruiklimieten per speler, per dag en voor aanmeldingen', async () => {
  const env = env0();
  const a = await founder(env, 'Anja', null, 'DC De Pijl');
  assert.match(a.club.inviteCode, /^[A-HJKMNP-Z2-9]{8}$/);
  // Tweede club binnen 30 dagen mag, derde niet.
  await ok(await call(env, '/v1/clubs', { method: 'POST', token: a.token, body: { name: 'Tweede club', consent: true } }), 201);
  const r3 = await call(env, '/v1/clubs', { method: 'POST', token: a.token, body: { name: 'Derde club', consent: true } });
  assert.equal(r3.status, 429); assert.match((await r3.json()).error, /30 dagen/);
  // Zonder bevestiging van wat je deelt: geen club.
  const b = await founder(env, 'Bram', null, 'Darts Oost');
  assert.equal(await status(await call(env, '/v1/clubs', { method: 'POST', token: b.token, body: { name: 'Zonder ja' } })), 400);
  // Beheerder van hoogstens 3 clubs (ook als clubs ouder zijn dan 30 dagen).
  env.DB.raw.exec("UPDATE clubs SET created_at = datetime('now','-40 days')");
  await ok(await call(env, '/v1/clubs', { method: 'POST', token: a.token, body: { name: 'Club drie', consent: true } }), 201);
  env.DB.raw.exec("UPDATE clubs SET created_at = datetime('now','-40 days')");
  const r4 = await call(env, '/v1/clubs', { method: 'POST', token: a.token, body: { name: 'Club vier', consent: true } });
  assert.equal(r4.status, 409); assert.match((await r4.json()).error, /beheerder van 3/);
  // Noodrem: hoogstens 100 nieuwe clubs per dag voor heel OKKIE.
  const stmt = env.DB.raw.prepare("INSERT INTO clubs(id,name,invite_code,created_at,updated_at) VALUES(?,?,?,datetime('now'),datetime('now'))");
  for (let i = 0; i < 100; i++) stmt.run('f'.repeat(24) + String(i).padStart(8, '0'), 'Vul ' + i, 'V' + String(i).padStart(7, '0').replace(/\d/g, d => 'ABCDEFGHJK'[d]));
  const c = await founder(env, 'Cor', null, 'Club van Cor').catch(e => e);
  assert.match(String(c.message || c), /429|erg veel clubs/);
  // Openstaande aanmeldingen: hoogstens 3 per speler.
  const codes = env.DB.raw.prepare("SELECT invite_code AS c FROM clubs WHERE name LIKE 'Vul %' LIMIT 4").all().map(r => r.c);
  const p = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Piet', clubCode: codes[0], age: 'adult' } }), 201);
  for (const code of codes.slice(0, 3)) await ok(await call(env, '/v1/clubs/join', { method: 'POST', token: p.token, body: { code, consent: true } }), 201);
  const j4 = await call(env, '/v1/clubs/join', { method: 'POST', token: p.token, body: { code: codes[3], consent: true } });
  assert.equal(j4.status, 429); assert.match((await j4.json()).error, /3 aanmeldingen/);
  // Proefclubcodes zijn niet meer nodig en geven ook geen voorrang.
  assert.equal(await status(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Oud', pilotCode: PILOTS[0], age: 'adult' } })), 403);
});

test('alleen 16+: jonger dan 16 kan geen account via een club maken, geen club maken en niet lid worden', async () => {
  const env = env0();
  const a = await founder(env, 'Anja', PILOTS[0], 'DC De Pijl');
  assert.equal(await status(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Kind', clubCode: a.club.inviteCode, age: 'minor' } })), 403);
  assert.equal(await status(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Kind', clubFounder: true, age: 'minor' } })), 403);
  // Bestaand minderjarig profiel (bijv. uit Mijn vrienden) kan ook niet lid worden.
  env.DB.raw.prepare("INSERT INTO members(id,handle,nickname,token_hash,recovery_hash,visible,age_group,created_at,updated_at) VALUES('m1','kindkindkind','Kind',?,?,0,'minor',datetime('now'),datetime('now'))")
    .run('x'.repeat(64), 'y'.repeat(64));
  const acc = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Volwassen', clubCode: a.club.inviteCode, age: 'adult' } }), 201);
  env.DB.raw.prepare("UPDATE members SET age_group = 'minor' WHERE handle = ?").run(acc.account.handle);
  assert.equal(await status(await call(env, '/v1/clubs/join', { method: 'POST', token: acc.token, body: { code: a.club.inviteCode, consent: true } })), 403);
  assert.equal(await status(await call(env, '/v1/clubs', { method: 'POST', token: acc.token, body: { name: 'Jeugd', consent: true } })), 403);
});

test('lid worden: code geeft alleen een aanvraag; wachtend lid ziet niets tot de beheerder goedkeurt; afwijzen wist de aanvraag', async () => {
  const env = env0();
  const a = await founder(env, 'Anja', PILOTS[0], 'DC De Pijl');
  // Code bekijken zonder account: alleen naam en aantal.
  const preview = await ok(await call(env, '/v1/clubs/preview', { method: 'POST', body: { code: a.club.inviteCode.toLowerCase() } }));
  assert.deepEqual(preview, { club: { name: 'DC De Pijl', members: 1 } });
  assert.equal(await status(await call(env, '/v1/clubs/preview', { method: 'POST', body: { code: 'ZZZZZZZZ' } })), 404);
  const p = await joiner(env, 'Piet', a.club.inviteCode, a, a.club.id, false);
  for (const path of ['', '/feed', '/form', '/challenge', '/requests'])
    assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}${path}`, { token: p.token })), 404, 'wachtend lid: ' + path);
  assert.equal(await status(await share(env, p, a.club.id, training('t1', 'score30', 30, 900))), 404);
  const mine = await ok(await call(env, '/v1/clubs', { token: p.token }));
  assert.deepEqual(mine.clubs, [{ id: a.club.id, name: 'DC De Pijl', status: 'pending' }]);
  const reqs = await ok(await call(env, `/v1/clubs/${a.club.id}/requests`, { token: a.token }));
  assert.deepEqual(reqs.requests.map(r => r.nickname), ['Piet']);
  await ok(await call(env, `/v1/clubs/${a.club.id}/requests/${p.account.handle}`, { method: 'POST', token: a.token, body: { approve: false } }));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM club_members WHERE member_id = (SELECT id FROM members WHERE handle = ?)').get(p.account.handle).n, 0);
  // Opnieuw aanvragen en nu goedkeuren.
  await ok(await call(env, '/v1/clubs/join', { method: 'POST', token: p.token, body: { code: a.club.inviteCode, consent: true } }), 201);
  await ok(await call(env, `/v1/clubs/${a.club.id}/requests/${p.account.handle}`, { method: 'POST', token: a.token, body: { approve: true } }));
  const club = await ok(await call(env, `/v1/clubs/${a.club.id}`, { token: p.token }));
  assert.equal(club.club.role, 'member');
  assert.equal(club.club.inviteCode, undefined, 'alleen beheerders zien de code');
  // Code vernieuwen: oude werkt niet meer.
  const { inviteCode } = await ok(await call(env, `/v1/clubs/${a.club.id}/code`, { method: 'POST', token: a.token }));
  assert.notEqual(inviteCode, a.club.inviteCode);
  assert.equal(await status(await call(env, '/v1/clubs/preview', { method: 'POST', body: { code: a.club.inviteCode } })), 404);
});

test('clubscheiding: een lid van club B krijgt op ELKE route van club A 404, ook met een geldig club-ID', async () => {
  const { env, a, b1 } = await twoClubs();
  const A = a.club.id;
  const routes = [['GET', ''], ['PATCH', '', { name: 'Overgenomen' }], ['DELETE', ''], ['POST', '/code'], ['GET', '/requests'],
    ['POST', '/requests/' + a.account.handle, { approve: true }], ['PATCH', '/members/' + a.account.handle, { role: 'member' }],
    ['DELETE', '/members/' + a.account.handle], ['POST', '/teams', { name: 'Kaper' }], ['PUT', '/challenge', { kind: 'clock' }],
    ['GET', '/challenge'], ['GET', '/challenge?week=previous'], ['POST', '/trainings', { training: training('x', 'score30', 30, 900), feed: true, challenge: true }],
    ['DELETE', '/results/' + a.account.handle], ['GET', '/feed'], ['GET', '/form']];
  for (const [method, path, body] of routes) {
    const res = await call(env, `/v1/clubs/${A}${path}`, { method, token: b1.token, body });
    assert.equal(res.status, 404, `${method} ${path}`);
    const text = await res.text();
    assert.doesNotMatch(text, /Anja|Alex|Amira|De Pijl/, `${method} ${path} lekt niets`);
  }
  // Verzonnen en ongeldige ID's.
  for (const id of ['0'.repeat(32), 'nietbestaand', A.toUpperCase(), A + 'x'])
    assert.equal(await status(await call(env, `/v1/clubs/${id}`, { token: b1.token })), 404);
  // Club A is ongewijzigd.
  assert.equal(env.DB.raw.prepare('SELECT name FROM clubs WHERE id = ?').get(A).name, 'DC De Pijl');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM club_challenges WHERE club_id = ? AND kind = 'clock'").get(A).n, 0);
});

test('clubscheiding: ranglijst, feed, leden, vorm en teams van club A bevatten nooit iemand die alleen in club B zit', async () => {
  const { env, a, b, a1, b1, both } = await twoClubs(env0({ CLUB_TEST_NOW: undefined }));
  // CLUB_TEST_NOW niet gezet: de echte week, zodat de vormranglijst de gesynchroniseerde weekcijfers ziet.
  const wk = weekKey();
  for (const [acc, pts] of [[a, 5400], [a1, 4500], [b1, 5390], [both, 3600], [b, 5000]])
    await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: acc.token, body: { snapshots: [snap('all', pts), snap(wk, pts)] } }));
  // Weekoefening: alleen als de echte week nog open is (zondag na 22:00 is hij gesloten).
  const open = weekOpen(clubWeek(new Date()), new Date());
  for (const [acc, club, id, pts] of [[a1, a, 'a1', 1200], [b1, b, 'b1', 1500], [both, a, 'd1', 900], [both, b, 'd2', 1000]])
    await ok(await share(env, acc, club.club.id, training(id, 'score30', 30, pts), { feed: true, challenge: open }), 201);
  const A = a.club.id, B = b.club.id;
  const onlyB = ['Bram', 'Bas'];
  const club = await ok(await call(env, `/v1/clubs/${A}`, { token: a1.token }));
  assert.deepEqual(club.members.map(m => m.nickname).sort(), ['Alex', 'Amira', 'Anja', 'Dubbel']);
  if (open) {
    assert.deepEqual(club.thisWeek.ranking.map(r => r.nickname), ['Alex', 'Dubbel']);
    assert.equal(club.thisWeek.ranking.find(r => r.nickname === 'Dubbel').points, 900, 'resultaat uit club B telt niet in club A');
  }
  const feed = await ok(await call(env, `/v1/clubs/${A}/feed`, { token: a1.token }));
  assert.deepEqual(feed.feed.map(f => f.nickname).sort(), ['Alex', 'Dubbel']);
  assert.ok(feed.feed.every(f => f.points !== 1000 && f.points !== 1500));
  const form = await ok(await call(env, `/v1/clubs/${A}/form`, { token: a1.token }));
  assert.deepEqual(form.ranking.map(r => r.nickname), ['Anja', 'Alex', 'Dubbel', 'Amira']);
  for (const body of [club, feed, form]) for (const n of onlyB) assert.doesNotMatch(JSON.stringify(body), new RegExp(n));
  // En omgekeerd: B ziet niemand die alleen in A zit.
  const bView = JSON.stringify([await ok(await call(env, `/v1/clubs/${B}`, { token: b1.token })), await ok(await call(env, `/v1/clubs/${B}/feed`, { token: b1.token })),
    await ok(await call(env, `/v1/clubs/${B}/form`, { token: b1.token }))]);
  for (const n of ['Anja', 'Alex', 'Amira']) assert.doesNotMatch(bView, new RegExp(n));
  // De speler in beide clubs ziet per club alleen die club.
  const dubbelA = await ok(await call(env, `/v1/clubs/${A}/feed`, { token: both.token }));
  assert.ok(dubbelA.feed.every(f => !onlyB.includes(f.nickname)));
  // Feedbericht van club B kan niet via club A worden verwijderd.
  const bFeedId = env.DB.raw.prepare('SELECT id FROM club_feed WHERE club_id = ? LIMIT 1').get(B).id;
  assert.equal(await status(await call(env, `/v1/clubs/${A}/feed/${bFeedId}`, { method: 'DELETE', token: a.token })), 404);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM club_feed WHERE id = ?').get(bFeedId).n, 1);
});

test('clubscheiding: teams en captain-overzicht van club A zijn niet bereikbaar vanuit club B, ook niet met een team-ID', async () => {
  const { env, a, b, a1, b1 } = await twoClubs();
  const team = (await ok(await call(env, `/v1/clubs/${a.club.id}/teams`, { method: 'POST', token: a.token, body: { name: 'Team 1' } }), 201)).team;
  // Team van A via club B (waar b admin is): bestaat niet.
  assert.equal(await status(await call(env, `/v1/clubs/${b.club.id}/teams/${team.id}`, { token: b.token })), 404);
  assert.equal(await status(await call(env, `/v1/clubs/${b.club.id}/teams/${team.id}`, { method: 'PATCH', token: b.token, body: { name: 'X' } })), 404);
  // Lid van B aan team van A koppelen of captain maken: geweigerd.
  assert.equal(await status(await call(env, `/v1/clubs/${b.club.id}/members/${b1.account.handle}`, { method: 'PATCH', token: b.token, body: { teamId: team.id } })), 404);
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}/teams/${team.id}`, { method: 'PATCH', token: a.token, body: { captain: b1.account.handle } })), 404);
  assert.equal(env.DB.raw.prepare('SELECT captain_id FROM club_teams WHERE id = ?').get(team.id).captain_id, null);
  void a1;
});

test('rollen: lid kan niets beheren; captain ziet alleen het overzicht van zijn eigen team; beheerder alles', async () => {
  const { env, a, a1, a2, both } = await twoClubs();
  const A = a.club.id;
  const t1 = (await ok(await call(env, `/v1/clubs/${A}/teams`, { method: 'POST', token: a.token, body: { name: 'Team 1' } }), 201)).team;
  const t2 = (await ok(await call(env, `/v1/clubs/${A}/teams`, { method: 'POST', token: a.token, body: { name: 'Team 2' } }), 201)).team;
  await ok(await call(env, `/v1/clubs/${A}/teams/${t1.id}`, { method: 'PATCH', token: a.token, body: { captain: a1.account.handle } }));
  for (const [acc, team] of [[a1, t1], [both, t1], [a2, t2]])
    await ok(await call(env, `/v1/clubs/${A}/members/${acc.account.handle}`, { method: 'PATCH', token: a.token, body: { teamId: team.id } }));
  // Captain werd automatisch rol 'captain'.
  assert.equal((await ok(await call(env, `/v1/clubs/${A}`, { token: a1.token }))).club.role, 'captain');
  // Gewoon lid: alle beheerroutes 403.
  const adminOnly = [['PATCH', '', { name: 'X' }], ['DELETE', ''], ['POST', '/code'], ['GET', '/requests'], ['PATCH', `/members/${both.account.handle}`, { role: 'admin' }],
    ['DELETE', `/members/${both.account.handle}`], ['POST', '/teams', { name: 'Eigen' }], ['PUT', '/challenge', { kind: 'clock' }],
    ['DELETE', `/results/${both.account.handle}`], ['GET', `/teams/${t1.id}`], ['PATCH', `/teams/${t1.id}`, { name: 'X' }], ['DELETE', `/teams/${t2.id}`]];
  for (const [method, path, body] of adminOnly) assert.equal(await status(await call(env, `/v1/clubs/${A}${path}`, { method, token: a2.token, body })), 403, `lid: ${method} ${path}`);
  // Captain: eigen team wel, ander team niet, beheer niet.
  const overview = await ok(await call(env, `/v1/clubs/${A}/teams/${t1.id}`, { token: a1.token }));
  assert.deepEqual(overview.players.map(p => p.nickname).sort(), ['Alex', 'Dubbel']);
  assert.equal(await status(await call(env, `/v1/clubs/${A}/teams/${t2.id}`, { token: a1.token })), 403);
  for (const [method, path, body] of adminOnly.filter(([, p]) => !p.startsWith(`/teams/${t1.id}`) || true).slice(0, 8))
    assert.equal(await status(await call(env, `/v1/clubs/${A}${path}`, { method, token: a1.token, body })), 403, `captain: ${method} ${path}`);
  // Beheerder: overzicht van elk team, rollen wijzigen.
  await ok(await call(env, `/v1/clubs/${A}/teams/${t2.id}`, { token: a.token }));
  await ok(await call(env, `/v1/clubs/${A}/members/${a2.account.handle}`, { method: 'PATCH', token: a.token, body: { role: 'admin' } }));
  await ok(await call(env, `/v1/clubs/${A}/requests`, { token: a2.token }));
  // Minstens één beheerder: de enige beheerder kan zichzelf niet degraderen.
  await ok(await call(env, `/v1/clubs/${A}/members/${a2.account.handle}`, { method: 'PATCH', token: a.token, body: { role: 'member' } }));
  assert.equal(await status(await call(env, `/v1/clubs/${A}/members/${a.account.handle}`, { method: 'PATCH', token: a.token, body: { role: 'member' } })), 409);
  // Captain terug naar lid: niet meer captain van het team.
  await ok(await call(env, `/v1/clubs/${A}/members/${a1.account.handle}`, { method: 'PATCH', token: a.token, body: { role: 'member' } }));
  assert.equal(await status(await call(env, `/v1/clubs/${A}/teams/${t1.id}`, { token: a1.token })), 403);
});

test('weekoefening: één oefening per week, beste resultaat telt, ranglijst sluit zondag 22:00 (Amsterdam)', async () => {
  const { env, a, a1, a2 } = await twoClubs();
  const A = a.club.id;
  await ok(await share(env, a1, A, training('t1', 'score30', 30, 1000)), 201);
  const r2 = await ok(await share(env, a1, A, training('t2', 'score30', 30, 900)), 201);
  assert.equal(r2.challenge.best, false, 'slechtere poging telt niet');
  await ok(await share(env, a1, A, training('t3', 'score30', 30, 1100)), 201);
  await ok(await share(env, a2, A, training('t4', 'score30', 30, 1050), { feed: false }), 201);
  // Verkeerde soort, onmogelijke cijfers, niets gekozen.
  assert.equal(await status(await share(env, a1, A, training('t5', 'score60', 60, 2000))), 409);
  assert.equal(await status(await share(env, a1, A, training('t6', 'score30', 30, 1801))), 400);
  assert.equal(await status(await share(env, a1, A, training('t7', 'score30', 31, 900))), 400);
  assert.equal(await status(await share(env, a1, A, training('t8', 'score30', 30, 900), { feed: false, challenge: false })), 400);
  // Oefening wijzigen kan niet meer nu er resultaten zijn.
  assert.equal(await status(await call(env, `/v1/clubs/${A}/challenge`, { method: 'PUT', token: a.token, body: { kind: 'clock' } })), 409);
  let view = await ok(await call(env, `/v1/clubs/${A}/challenge`, { token: a2.token }));
  assert.deepEqual(view.ranking.map(r => [r.nickname, r.points]), [['Alex', 1100], ['Amira', 1050]]);
  assert.equal(view.challenge.open, true);
  assert.equal(view.challenge.closesAt, '2026-11-08 22:00');
  // Zondag 21:59 (CET = UTC+1) nog open, 22:00 dicht.
  assert.equal(await status(await share(at(env, '2026-11-08T20:59:00Z'), a2, A, training('t9', 'score30', 30, 1060), { feed: false })), 201);
  assert.equal(await status(await share(at(env, '2026-11-08T21:00:00Z'), a2, A, training('t10', 'score30', 30, 1500), { feed: false })), 409);
  view = await ok(await call(at(env, '2026-11-08T21:30:00Z'), `/v1/clubs/${A}/challenge`, { token: a2.token }));
  assert.equal(view.challenge.open, false);
  assert.deepEqual(view.ranking.map(r => [r.nickname, r.points]), [['Amira', 1060], ['Alex', 1100]].sort((x, y) => y[1] - x[1]));
  // Maandag: nieuwe week zonder oefening; vorige week is nog te bekijken.
  const mon = at(env, '2026-11-09T08:00:00Z');
  assert.equal((await ok(await call(mon, `/v1/clubs/${A}/challenge`, { token: a2.token }))).challenge, null);
  assert.equal((await ok(await call(mon, `/v1/clubs/${A}/challenge?week=previous`, { token: a2.token }))).ranking.length, 2);
  // Oefening voor volgende week alvast klaarzetten (rond de klok: minder pijlen is beter).
  await ok(await call(env, `/v1/clubs/${A}/challenge`, { method: 'PUT', token: a.token, body: { kind: 'clock', week: 'next' } }));
  await ok(await share(mon, a1, A, { trainingId: 'k1', kind: 'clock', darts: 60, points: 0 }), 201);
  await ok(await share(mon, a2, A, { trainingId: 'k2', kind: 'clock', darts: 45, points: 0 }), 201);
  assert.deepEqual((await ok(await call(mon, `/v1/clubs/${A}/challenge`, { token: a1.token }))).ranking.map(r => r.nickname), ['Amira', 'Alex']);
  // Beheerder verwijdert een (verdacht) resultaat; lid kan dat niet bij een ander.
  assert.equal(await status(await call(mon, `/v1/clubs/${A}/results/${a2.account.handle}`, { method: 'DELETE', token: a1.token })), 403);
  await ok(await call(mon, `/v1/clubs/${A}/results/${a2.account.handle}`, { method: 'DELETE', token: a.token }));
  assert.deepEqual((await ok(await call(mon, `/v1/clubs/${A}/challenge`, { token: a1.token }))).ranking.map(r => r.nickname), ['Alex']);
});

test('feed: alleen trainingen die het lid zelf deelt; eigen bericht verwijderen; beheerder kan elk bericht in zijn club verwijderen', async () => {
  const { env, a, a1, a2 } = await twoClubs();
  const A = a.club.id;
  await ok(await share(env, a1, A, training('f1', 'free', 45, 900), { feed: true, challenge: false }), 201);
  await ok(await share(env, a1, A, training('f1', 'free', 45, 900), { feed: true, challenge: false }), 201);   // dubbel: één bericht
  await ok(await share(env, a2, A, training('w1', 'score30', 30, 1000), { feed: false, challenge: true }), 201);
  let feed = (await ok(await call(env, `/v1/clubs/${A}/feed`, { token: a2.token }))).feed;
  assert.deepEqual(feed.map(f => [f.nickname, f.kind, f.average]), [['Alex', 'free', 60]], 'training zonder feed-keuze staat niet in de feed');
  assert.equal(await status(await call(env, `/v1/clubs/${A}/feed/${feed[0].id}`, { method: 'DELETE', token: a2.token })), 404);
  await ok(await call(env, `/v1/clubs/${A}/feed/${feed[0].id}`, { method: 'DELETE', token: a1.token }));
  await ok(await share(env, a1, A, training('f2', 'free', 30, 600), { feed: true, challenge: false }), 201);
  feed = (await ok(await call(env, `/v1/clubs/${A}/feed`, { token: a.token }))).feed;
  await ok(await call(env, `/v1/clubs/${A}/feed/${feed[0].id}`, { method: 'DELETE', token: a.token }));
  assert.equal((await ok(await call(env, `/v1/clubs/${A}/feed`, { token: a.token }))).feed.length, 0);
});

test('verlaten: lid verlaat de club en al zijn clubgegevens (lidmaatschap, weekresultaten, feed) worden gewist; trainingen elders blijven', async () => {
  const { env, a, b, both } = await twoClubs();
  await ok(await share(env, both, a.club.id, training('d1', 'score30', 30, 900)), 201);
  await ok(await share(env, both, b.club.id, training('d2', 'score30', 30, 950)), 201);
  const id = env.DB.raw.prepare('SELECT id FROM members WHERE handle = ?').get(both.account.handle).id;
  const left = await ok(await call(env, `/v1/clubs/${a.club.id}/me`, { method: 'DELETE', token: both.token }));
  assert.equal(left.left, true);
  for (const t of ['club_members', 'club_results', 'club_feed'])
    assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE member_id = ? AND club_id = ?`).get(id, a.club.id).n, 0, t);
  // Club B ongemoeid.
  for (const t of ['club_members', 'club_results', 'club_feed'])
    assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE member_id = ? AND club_id = ?`).get(id, b.club.id).n, 1, t);
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}`, { token: both.token })), 404, 'na verlaten bestaat de club niet meer voor hem');
  // Openstaande aanvraag intrekken werkt ook.
  const p = await joiner(env, 'Piet', a.club.inviteCode, a, a.club.id, false);
  await ok(await call(env, `/v1/clubs/${a.club.id}/me`, { method: 'DELETE', token: p.token }));
  assert.equal((await ok(await call(env, `/v1/clubs/${a.club.id}/requests`, { token: a.token }))).requests.length, 0);
});

test('verwijderen door beheerder: lid en al zijn gegevens in die club weg; hij ziet de club daarna niet meer', async () => {
  const { env, a, a1 } = await twoClubs();
  await ok(await share(env, a1, a.club.id, training('x1', 'score30', 30, 1000)), 201);
  await ok(await call(env, `/v1/clubs/${a.club.id}/members/${a1.account.handle}`, { method: 'DELETE', token: a.token }));
  const id = env.DB.raw.prepare('SELECT id FROM members WHERE handle = ?').get(a1.account.handle).id;
  for (const t of ['club_members', 'club_results', 'club_feed']) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE member_id = ?`).get(id).n, 0, t);
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}`, { token: a1.token })), 404);
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}/members/${a.account.handle}`, { method: 'DELETE', token: a.token })), 400, 'zichzelf: via verlaten');
});

test('laatste beheerder vertrekt: captain wordt beheerder; laatste lid vertrekt: club met alles verdwijnt', async () => {
  const env = env0();
  const a = await founder(env, 'Anja', PILOTS[0], 'DC De Pijl');
  const a1 = await joiner(env, 'Alex', a.club.inviteCode, a, a.club.id);
  const a2 = await joiner(env, 'Amira', a.club.inviteCode, a, a.club.id);
  await ok(await call(env, `/v1/clubs/${a.club.id}/members/${a2.account.handle}`, { method: 'PATCH', token: a.token, body: { role: 'captain' } }));
  await ok(await call(env, `/v1/clubs/${a.club.id}/me`, { method: 'DELETE', token: a.token }));
  assert.equal((await ok(await call(env, `/v1/clubs/${a.club.id}`, { token: a2.token }))).club.role, 'admin');
  await ok(await call(env, `/v1/clubs/${a.club.id}/me`, { method: 'DELETE', token: a2.token }));
  assert.equal((await ok(await call(env, `/v1/clubs/${a.club.id}`, { token: a1.token }))).club.role, 'admin');
  await ok(await call(env, `/v1/clubs/${a.club.id}/me`, { method: 'DELETE', token: a1.token }));
  for (const t of ['clubs', 'club_members', 'club_challenges', 'club_teams']) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0, t);
});

test('account verwijderen (DELETE /v1/me) wist alle clubgegevens in alle clubs en geeft het beheer door', async () => {
  const { env, a, b, a1, both } = await twoClubs();
  await ok(await share(env, both, a.club.id, training('d1', 'score30', 30, 900)), 201);
  await ok(await share(env, both, b.club.id, training('d2', 'score30', 30, 900)), 201);
  const id = env.DB.raw.prepare('SELECT id FROM members WHERE handle = ?').get(both.account.handle).id;
  await ok(await call(env, '/v1/me', { method: 'DELETE', token: both.token }));
  for (const t of ['club_members', 'club_results', 'club_feed']) assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE member_id = ?`).get(id).n, 0, t);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM members WHERE id = ?').get(id).n, 0);
  // Beheerder verwijdert account: club blijft bestaan met een nieuwe beheerder.
  await ok(await call(env, '/v1/me', { method: 'DELETE', token: a.token }));
  assert.equal((await ok(await call(env, `/v1/clubs/${a.club.id}`, { token: a1.token }))).club.role, 'admin');
});

test('beheerder heft de club op: alle leden, teams, oefeningen, resultaten en feed weg; accounts blijven', async () => {
  const { env, a, a1 } = await twoClubs();
  await ok(await share(env, a1, a.club.id, training('x', 'score30', 30, 900)), 201);
  await ok(await call(env, `/v1/clubs/${a.club.id}/teams`, { method: 'POST', token: a.token, body: { name: 'Team' } }), 201);
  await ok(await call(env, `/v1/clubs/${a.club.id}`, { method: 'DELETE', token: a.token }));
  for (const t of ['club_members', 'club_results', 'club_feed', 'club_teams', 'club_challenges'])
    assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE club_id = ?`).get(a.club.id).n, 0, t);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM members WHERE handle = ?').get(a1.account.handle).n, 1);
});

test('opschoning: lege clubaccounts blijven bestaan zolang ze in een club zitten; feed ouder dan 60 dagen gaat weg', async () => {
  const { env, a, a1 } = await twoClubs();
  await ok(await share(env, a1, a.club.id, training('old', 'free', 30, 600), { feed: true, challenge: false }), 201);
  env.DB.raw.exec("UPDATE members SET updated_at = datetime('now','-40 days'); UPDATE club_feed SET created_at = datetime('now','-61 days')");
  await worker.scheduled({}, env);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM members').get().n, 6, 'clubleden zonder statistieken worden niet als leeg account gewist');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM club_feed').get().n, 0);
});

test('herkomst en invoer: schrijven alleen vanaf toegestane herkomst; ongeldige trainingen geweigerd', async () => {
  const { env, a, a1 } = await twoClubs();
  assert.equal(await status(await call(env, `/v1/clubs/${a.club.id}/trainings`, { method: 'POST', token: a1.token, origin: 'https://kwaadaardig.example', body: { training: training('x', 'score30', 30, 900), feed: true } })), 403);
  for (const t of [null, {}, training('../x', 'score30', 30, 900), training('x', 'score99', 99, 99 * 60 + 1), training('x', 'free', 31, 300),
    training('x', 'free', 30, 300, 181), { trainingId: 'k', kind: 'clock', darts: 20, points: 0 }, { trainingId: 'k', kind: 'clock', darts: 30, points: 5 }, training('x', 'boogschieten', 30, 1)])
    assert.equal(trainingOkay(t), false, JSON.stringify(t));
  assert.equal(trainingOkay(training('x', 'score99', 99, 5000)), true);
  assert.equal(trainingOkay({ trainingId: 'k', kind: 'clock', darts: 21, points: 0 }), true);
});

test('tijd: clubweek en sluiting volgen Amsterdam, ook rond de wisseling naar wintertijd', () => {
  assert.equal(clubWeek(new Date('2026-11-04T12:00:00Z')), '2026-11-02');
  assert.equal(clubWeek(new Date('2026-11-01T23:30:00Z')), '2026-11-02', 'zondag 23:30 UTC is maandag 00:30 in Amsterdam (CET)');
  assert.equal(clubWeek(new Date('2026-11-01T22:59:00Z')), '2026-10-26', 'zondag 23:59 in Amsterdam hoort nog bij de vorige week');
  assert.equal(clubWeek(new Date('2026-11-01T20:00:00Z')), '2026-10-26');
  // Zomertijd (CEST, UTC+2): zondag 25 okt is de wisseldag; 22:00 lokaal = 21:00 UTC (na de wissel CET).
  assert.equal(weekOpen('2026-10-19', new Date('2026-10-25T20:59:00Z')), true);
  assert.equal(weekOpen('2026-10-19', new Date('2026-10-25T21:00:00Z')), false);
  // Midden in de zomer: 22:00 lokaal = 20:00 UTC.
  assert.equal(weekOpen('2026-07-06', new Date('2026-07-12T19:59:00Z')), true);
  assert.equal(weekOpen('2026-07-06', new Date('2026-07-12T20:00:00Z')), false);
  assert.equal(weekOpen('2026-11-02', new Date('2026-11-09T08:00:00Z')), false, 'vorige week is altijd dicht');
  assert.equal(closesAt('2026-11-02'), '2026-11-08 22:00');
  assert.deepEqual(amsterdam(new Date('2026-11-08T21:00:00Z')), { date: '2026-11-08', weekday: 7, hour: 22, minute: 0 });
  assert.equal(normalizeCode(' abcd-efgh '), 'ABCDEFGH');
  for (let i = 0; i < 50; i++) assert.match(newInviteCode(), /^[A-HJKMNP-Z2-9]{8}$/);
});

// ---------- 1.10.0: Bob's 27 en 121 Checkout als weekoefening, clubrecord per oefening ----------
test("weekoefening Bob's 27 en 121: beheerder kiest, resultaat uit de training, hoger is beter, clubrecord per oefening", async () => {
  const { env, a, b, a1, a2, b1, both } = await twoClubs();
  const A = a.club.id, B = b.club.id;
  const bobs = (id, pts) => ({ trainingId: id, kind: 'bobs27', darts: 63, points: pts });
  const c121 = (id, level, darts = 30) => ({ trainingId: id, kind: 'c121', darts, points: level });
  // Alleen de beheerder kiest; deze week staat al score30 zonder resultaten, dus wijzigen mag.
  assert.equal(await status(await call(env, `/v1/clubs/${A}/challenge`, { method: 'PUT', token: a1.token, body: { kind: 'bobs27' } })), 403);
  await ok(await call(env, `/v1/clubs/${A}/challenge`, { method: 'PUT', token: a.token, body: { kind: 'bobs27' } }));
  await ok(await call(env, `/v1/clubs/${B}/challenge`, { method: 'PUT', token: b.token, body: { kind: 'bobs27' } }));
  assert.equal(await status(await call(env, `/v1/clubs/${A}/challenge`, { method: 'PUT', token: a.token, body: { kind: 'cricket' } })), 400);
  // Alleen de eindscore: 63 pijlen, 0-1437, geen hoogste beurt; extra velden (zoals losse pijlen) worden niet bewaard.
  await ok(await share(env, a1, A, { ...bobs('d1', 412), turns: [{ target: 'D1', hits: 3 }] }), 201);
  await ok(await share(env, a2, A, bobs('d2', 300), { feed: false }), 201);
  const r = await ok(await share(env, a1, A, bobs('d3', 250)), 201);
  assert.equal(r.challenge.best, false, 'lagere score telt niet: hoger is beter');
  for (const bad of [bobs('x1', 1438), { ...bobs('x2', 300), darts: 60 }, { ...bobs('x3', 300), high: 100 }]) assert.equal(await status(await share(env, a1, A, bad)), 400);
  assert.equal(await status(await share(env, a1, A, c121('x4', 124))), 409, 'andere oefening dan deze week');
  // Club B: hogere score van een lid dat alleen in B zit, en van het lid dat in beide clubs zit.
  await ok(await share(env, b1, B, bobs('e1', 900)), 201);
  await ok(await share(env, both, B, bobs('e2', 800)), 201);
  let view = await ok(await call(env, `/v1/clubs/${A}/challenge`, { token: a2.token }));
  assert.deepEqual(view.ranking.map(x => [x.nickname, x.points, x.average]), [['Alex', 412, null], ['Amira', 300, null]]);
  assert.deepEqual(view.record, { value: 412, nickname: 'Alex', week: view.week }, 'clubrecord van club A, niet de 900 uit club B');
  const feed = await ok(await call(env, `/v1/clubs/${A}/feed`, { token: a1.token }));
  assert.ok(!JSON.stringify(feed).includes('turns'), 'geen losse pijlen in de feed');
  const row = env.DB.raw.prepare("SELECT * FROM club_results WHERE training_id = 'd1'").get();
  assert.deepEqual(Object.keys(row).sort(), ['challenge_id', 'club_id', 'darts', 'high', 'member_id', 'points', 'submitted_at', 'training_id', 'value']);
  // Volgende week 121 Checkout; het record van Bob's 27 blijft per soort apart.
  await ok(await call(env, `/v1/clubs/${A}/challenge`, { method: 'PUT', token: a.token, body: { kind: 'c121', week: 'next' } }));
  const next = at(env, '2026-11-10T19:00:00Z');
  assert.equal(await status(await share(next, a1, A, c121('f0', 120))), 400, 'niveau onder 121 kan niet');
  assert.equal(await status(await share(next, a1, A, c121('f9', 131))), 400, 'boven 130 kan niet in 10 doelen');
  assert.equal(await status(await share(next, a1, A, c121('f8', 125, 91))), 400, 'meer dan 90 pijlen kan niet');
  await ok(await share(next, a1, A, c121('f1', 123)), 201);
  await ok(await share(next, a2, A, c121('f2', 126)), 201);
  view = await ok(await call(next, `/v1/clubs/${A}/challenge`, { token: a1.token }));
  assert.deepEqual(view.ranking.map(x => [x.nickname, x.points]), [['Amira', 126], ['Alex', 123]]);
  assert.equal(view.record.value, 126);
  assert.equal(view.challenge.kind, 'c121');
  const prev = await ok(await call(next, `/v1/clubs/${A}/challenge?week=previous`, { token: a1.token }));
  assert.equal(prev.record.value, 412, "clubrecord Bob's 27 blijft");
  // Wie de club verlaat, telt niet meer mee voor het clubrecord.
  await ok(await call(next, `/v1/clubs/${A}/me`, { method: 'DELETE', token: a2.token }));
  view = await ok(await call(next, `/v1/clubs/${A}/challenge`, { token: a1.token }));
  assert.equal(view.record.value, 123);
  // Niet-lid ziet niets.
  assert.equal(await status(await call(next, `/v1/clubs/${A}/challenge`, { token: b1.token })), 404);
});

test('trainingOkay: grenzen voor bobs27 en c121', () => {
  assert.equal(trainingOkay({ trainingId: 'a', kind: 'bobs27', darts: 63, points: 0 }), true);
  assert.equal(trainingOkay({ trainingId: 'a', kind: 'bobs27', darts: 63, points: 1437 }), true);
  assert.equal(trainingOkay({ trainingId: 'a', kind: 'bobs27', darts: 63, points: 1438 }), false);
  assert.equal(trainingOkay({ trainingId: 'a', kind: 'bobs27', darts: 30, points: 100 }), false, 'alleen volledig gespeeld');
  assert.equal(trainingOkay({ trainingId: 'a', kind: 'c121', darts: 3, points: 121 }), true);
  assert.equal(trainingOkay({ trainingId: 'a', kind: 'c121', darts: 90, points: 130 }), true);
  assert.equal(trainingOkay({ trainingId: 'a', kind: 'c121', darts: 0, points: 121 }), false);
});
