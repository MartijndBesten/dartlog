// Mijn vrienden: integratietests op echte SQLite (node:sqlite) met veel gebruikers en meerdere groepen.
// Alle namen en scores zijn fictief.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';
import { weekKey, LIMITS } from '../src/groups.js';

const ORIGIN = 'https://martijndbesten.github.io';
const API = 'https://api.okkiedarts.nl';
const FOUNDER = 'oprichter-test-code-1234567890';
const env0 = (extra = {}) => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, GROUPS_ENABLED: 'true', REGISTRATION_ENABLED: 'false', GROUP_FOUNDER_CODE: FOUNDER, ...extra });

const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async u => { throw new Error('Onverwachte externe aanroep: ' + u); }; });
after(() => { globalThis.fetch = realFetch; });

let ip = 0;
const call = (env, path, { method = 'GET', body, token, origin = ORIGIN, newIp = false } = {}) => {
  const h = { 'CF-Connecting-IP': newIp ? `10.0.${ip >> 8 & 255}.${ip++ & 255}` : '10.9.9.9' };
  if (origin) h.Origin = origin;
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return worker.fetch(new Request(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
};
const ok = async (res, status = 200) => { const b = await res.json(); assert.equal(res.status, status, JSON.stringify(b)); return b; };
const SHARE_ALL = { average: true, records: true, challenge: true };
const week = weekKey();
const snap = (period, points, darts = 30, extra = {}) => ({ period, darts, points, sessions: Math.max(1, darts / 30 | 0), highestTurn: 100, hits100: 1, hits140: 0, hits180: 0,
  best30: darts >= 30 ? Math.min(points, 1800) : null, challenge30: darts >= 30 ? Math.min(points, 1800) : null, ...extra });

async function founder(env, nickname = 'Martijn') {
  return ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, founderCode: FOUNDER, age: 'adult' } }), 201);
}
async function viaInvite(env, token, nickname, share = SHARE_ALL) {
  const acc = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, inviteToken: token, age: 'adult' }, newIp: true }), 201);
  await ok(await call(env, '/v1/invites/accept', { method: 'POST', token: acc.token, body: { token, share }, newIp: true }), 201);
  return acc;
}
async function makeGroup(env, owner, name = 'Dartvrienden') {
  return (await ok(await call(env, '/v1/groups', { method: 'POST', token: owner.token, body: { name, share: SHARE_ALL } }), 201)).group;
}
async function invite(env, owner, groupId, opts = {}) {
  return (await ok(await call(env, `/v1/groups/${groupId}/invites`, { method: 'POST', token: owner.token, body: { days: 7, maxUses: 30, ...opts } }), 201)).invite;
}

test('standaard uit: zonder GROUPS_ENABLED bestaat Mijn vrienden niet en blijft registratie dicht', async () => {
  const env = env0({ GROUPS_ENABLED: undefined });
  for (const v of [undefined, 'false', 'TRUE', '1']) {
    const e = { ...env, GROUPS_ENABLED: v };
    assert.equal((await call(e, '/v1/groups')).status, 404);
    assert.equal((await call(e, '/v1/invites/preview', { method: 'POST', body: { token: 'a'.repeat(64) } })).status, 404);
    const r = await call(e, '/v1/register', { method: 'POST', body: { nickname: 'Test', founderCode: FOUNDER, age: 'adult' } });
    assert.equal(r.status, 403);
  }
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM members').get().n, 0);
  assert.equal((await (await call(env0(), '/v1/health')).json()).groups, true);
});

test('oprichterscode: alleen met het juiste geheim, nooit een openbaar profiel', async () => {
  const env = env0();
  assert.equal((await call(env, '/v1/register', { method: 'POST', body: { nickname: 'X', founderCode: 'fout', age: 'adult' } })).status, 403);
  assert.equal((await call({ ...env, GROUP_FOUNDER_CODE: 'kort' }, '/v1/register', { method: 'POST', body: { nickname: 'Xx', founderCode: 'kort', age: 'adult' } })).status, 403);
  assert.equal((await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Kind', founderCode: FOUNDER, age: 'minor' } })).status, 403);
  const acc = await founder(env);
  assert.equal(acc.public, false);
  assert.equal(env.DB.raw.prepare('SELECT visible FROM members WHERE handle = ?').get(acc.account.handle).visible, 0);
  // niet zichtbaar in de openbare ranglijst of als openbaar profiel
  await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: acc.token, body: { snapshots: [snap('all', 1500, 90), snap(week, 600)] } }));
  assert.deepEqual((await ok(await call(env, '/v1/leaderboard?period=all'))).ranking, []);
  assert.equal((await call(env, '/v1/players/' + acc.account.handle)).status, 404);
});

test('25 vrienden in één groep via één link; rollen, limieten en beheer', async () => {
  const env = env0();
  const owner = await founder(env);
  const group = await makeGroup(env, owner, 'Café De Pijl');
  const inv = await invite(env, owner, group.id, { maxUses: 30 });
  assert.match(inv.token, /^[a-f0-9]{64}$/);
  // de server bewaart alleen de hash
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM group_invites WHERE token_hash = ?').get(inv.token).n, 0);
  const preview = await ok(await call(env, '/v1/invites/preview', { method: 'POST', body: { token: inv.token } }));
  assert.deepEqual(preview.group, { name: 'Café De Pijl', members: 1 });
  assert.equal(JSON.stringify(preview).includes('Martijn'), false, 'preview toont geen leden');
  const friends = [];
  for (let i = 1; i <= 24; i++) friends.push(await viaInvite(env, inv.token, 'Vriend ' + i));
  const detail = await ok(await call(env, `/v1/groups/${group.id}`, { token: friends[0].token }));
  assert.equal(detail.members.length, 25);
  assert.equal(detail.members.filter(m => m.you).length, 1);
  assert.equal(JSON.stringify(detail).match(/token|recovery|hash|"id":"[0-9a-f-]{36}"/), null, 'geen geheimen of interne ID\'s');
  // gewoon lid mag niet beheren
  assert.equal((await call(env, `/v1/groups/${group.id}/invites`, { method: 'POST', token: friends[0].token, body: {} })).status, 403);
  assert.equal((await call(env, `/v1/groups/${group.id}/members/${friends[1].account.handle}`, { method: 'DELETE', token: friends[0].token })).status, 403);
  // eigenaar maakt beheerder; beheerder kan leden verwijderen maar niet de eigenaar of een andere beheerder
  await ok(await call(env, `/v1/groups/${group.id}/members/${friends[0].account.handle}`, { method: 'PATCH', token: owner.token, body: { role: 'admin' } }));
  await ok(await call(env, `/v1/groups/${group.id}/members/${friends[1].account.handle}`, { method: 'PATCH', token: owner.token, body: { role: 'admin' } }));
  assert.equal((await call(env, `/v1/groups/${group.id}/members/${owner.account.handle}`, { method: 'DELETE', token: friends[0].token })).status, 403);
  assert.equal((await call(env, `/v1/groups/${group.id}/members/${friends[1].account.handle}`, { method: 'DELETE', token: friends[0].token })).status, 403);
  await ok(await call(env, `/v1/groups/${group.id}/members/${friends[5].account.handle}`, { method: 'DELETE', token: friends[0].token }));
  assert.equal((await call(env, `/v1/groups/${group.id}`, { token: friends[5].token })).status, 404, 'verwijderd lid ziet niets meer');
  // beheerder mag niet de rol van iemand wijzigen
  assert.equal((await call(env, `/v1/groups/${group.id}/members/${friends[2].account.handle}`, { method: 'PATCH', token: friends[0].token, body: { role: 'admin' } })).status, 403);
  // naam wijzigen door beheerder, niet door lid
  await ok(await call(env, `/v1/groups/${group.id}`, { method: 'PATCH', token: friends[0].token, body: { name: 'Café De Pijl 2' } }));
  assert.equal((await call(env, `/v1/groups/${group.id}`, { method: 'PATCH', token: friends[3].token, body: { name: 'Hack' } })).status, 403);
  assert.equal((await call(env, `/v1/groups/${group.id}`, { method: 'PATCH', token: owner.token, body: { name: '<script>' } })).status, 400);
});

test('groepen zijn van elkaar gescheiden: niet-leden zien niets, ook niet met een geldig groeps-ID', async () => {
  const env = env0();
  const a = await founder(env, 'Anna');
  const ga = await makeGroup(env, a, 'Groep A');
  const invA = await invite(env, a, ga.id);
  const lidA = await viaInvite(env, invA.token, 'Lid A');
  // tweede, losse groep met eigen eigenaar
  const b = await viaInvite(env, (await invite(env, a, ga.id)).token, 'Bram');
  const gb = await makeGroup(env, b, 'Groep B');
  await ok(await call(env, `/v1/groups/${ga.id}/me`, { method: 'DELETE', token: b.token })); // Bram verlaat A, blijft eigenaar van B
  for (const path of ['', '/invites', '/me', `/members/${b.account.handle}`]) {
    for (const method of ['GET', 'PATCH', 'DELETE', 'POST']) {
      const r = await call(env, `/v1/groups/${gb.id}${path}`, { method, token: lidA.token, body: method === 'GET' || method === 'DELETE' ? undefined : { name: 'x', share: SHARE_ALL, role: 'admin' } });
      assert.equal(r.status, 404, `${method} ${path} van een andere groep`);
    }
  }
  // zonder token en met onzin-ID
  assert.equal((await call(env, `/v1/groups/${gb.id}`)).status, 401);
  assert.equal((await call(env, '/v1/groups/../../v1/admin', { token: lidA.token })).status, 404);
  const mine = await ok(await call(env, '/v1/groups', { token: lidA.token }));
  assert.deepEqual(mine.groups.map(g => g.name), ['Groep A']);
  const bram = await ok(await call(env, '/v1/groups', { token: b.token }));
  assert.deepEqual(bram.groups.map(g => [g.name, g.role]), [['Groep B', 'owner']]);
});

test('uitnodigingen: verlopen, ingetrokken, maximaal gebruik, ongeldig; link alleen geeft geen toegang', async () => {
  const env = env0();
  const owner = await founder(env);
  const g = await makeGroup(env, owner);
  const once = await invite(env, owner, g.id, { maxUses: 1 });
  await viaInvite(env, once.token, 'Eerste');
  const second = await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Tweede', inviteToken: once.token, age: 'adult' }, newIp: true });
  assert.equal(second.status, 403, 'opgebruikte link maakt geen account meer aan');
  const revoked = await invite(env, owner, g.id);
  await ok(await call(env, `/v1/groups/${g.id}/invites/${revoked.id}`, { method: 'DELETE', token: owner.token }));
  assert.equal((await call(env, '/v1/invites/preview', { method: 'POST', body: { token: revoked.token } })).status, 404);
  const expired = await invite(env, owner, g.id);
  env.DB.raw.prepare("UPDATE group_invites SET expires_at = datetime('now','-1 minute') WHERE id = ?").run(expired.id);
  assert.equal((await call(env, '/v1/invites/preview', { method: 'POST', body: { token: expired.token } })).status, 404);
  for (const token of ['', 'a'.repeat(64), 'xyz', 123]) {
    assert.equal((await call(env, '/v1/invites/preview', { method: 'POST', body: { token } })).status, 404);
  }
  // met een geldige link maar zonder account: geen groepsgegevens
  const open = await invite(env, owner, g.id);
  assert.equal((await call(env, '/v1/invites/accept', { method: 'POST', body: { token: open.token, share: SHARE_ALL } })).status, 401);
  assert.equal((await call(env, `/v1/groups/${g.id}`)).status, 401);
  // accepteren zonder expliciete deelkeuze lukt niet
  const acc = await viaInvite(env, open.token, 'Kiezer');
  const extra = await invite(env, owner, g.id);
  const x = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Twijfel', inviteToken: extra.token, age: 'adult' }, newIp: true }), 201);
  assert.equal((await call(env, '/v1/invites/accept', { method: 'POST', token: x.token, body: { token: extra.token } })).status, 400);
  assert.equal((await call(env, '/v1/invites/accept', { method: 'POST', token: x.token, body: { token: extra.token, share: { average: 'ja' } } })).status, 400);
  // dubbel accepteren is onschuldig
  const again = await ok(await call(env, '/v1/invites/accept', { method: 'POST', token: acc.token, body: { token: extra.token, share: SHARE_ALL } }));
  assert.equal(again.already, true);
  // lijst van uitnodigingen alleen voor beheer, zonder tokens
  const list = await ok(await call(env, `/v1/groups/${g.id}/invites`, { token: owner.token }));
  assert.ok(list.invites.length >= 4);
  assert.equal(JSON.stringify(list).includes(open.token), false);
  assert.deepEqual(list.invites.find(i => i.id === revoked.id).active, false);
  // grenzen
  assert.equal((await call(env, `/v1/groups/${g.id}/invites`, { method: 'POST', token: owner.token, body: { days: 31 } })).status, 400);
  assert.equal((await call(env, `/v1/groups/${g.id}/invites`, { method: 'POST', token: owner.token, body: { maxUses: 0 } })).status, 400);
});

test('privacy: iedereen deelt alleen wat hij kiest; delen stoppen en gegevens wissen', async () => {
  const env = env0();
  const owner = await founder(env, 'Eigenaar');
  const g = await makeGroup(env, owner);
  const inv = await invite(env, owner, g.id);
  const alleenGem = await viaInvite(env, inv.token, 'Alleen gemiddelde', { average: true, records: false, challenge: false });
  const niks = await viaInvite(env, inv.token, 'Kijkt alleen', { average: false, records: false, challenge: false });
  for (const acc of [owner, alleenGem, niks]) {
    await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: acc.token, body: { snapshots: [
      snap('all', 2700, 99, { best30: 900, best60: 1600, best99: 2700, highestTurn: 140, hits140: 1 }), snap(week, 900, 30)] } }));
  }
  const d = await ok(await call(env, `/v1/groups/${g.id}`, { token: owner.token }));
  const by = n => d.members.find(m => m.nickname === n);
  assert.ok(by('Eigenaar').records && by('Eigenaar').average && by('Eigenaar').challenge);
  assert.deepEqual(Object.keys(by('Alleen gemiddelde')).filter(k => ['average', 'records', 'challenge'].includes(k)), ['average']);
  assert.equal(by('Kijkt alleen').average, undefined);
  assert.equal(by('Kijkt alleen').records, undefined);
  assert.equal(by('Eigenaar').records.all.best99, 2700);
  assert.equal(by('Eigenaar').average.weeks.at(-1).week, week.slice(5));
  // nooit losse worpen of trainingsmomenten
  assert.equal(/darts":\[|turns|startedAt|finishedAt/.test(JSON.stringify(d)), false);
  // delen aanpassen
  await ok(await call(env, `/v1/groups/${g.id}/me`, { method: 'PATCH', token: alleenGem.token, body: { share: { average: false, records: false, challenge: false } } }));
  const d2 = await ok(await call(env, `/v1/groups/${g.id}`, { token: owner.token }));
  assert.equal(d2.members.find(m => m.nickname === 'Alleen gemiddelde').average, undefined);
  // gedeelde gegevens wissen
  await ok(await call(env, '/v1/me/snapshots', { method: 'DELETE', token: owner.token }));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM stats s JOIN members m ON m.id = s.member_id WHERE m.handle = ?').get(owner.account.handle).n, 0);
  // account verwijderen: weg uit de groep, eigenaarschap gaat naar het oudste lid
  await ok(await call(env, '/v1/me', { method: 'DELETE', token: owner.token }));
  const d3 = await ok(await call(env, `/v1/groups/${g.id}`, { token: alleenGem.token }));
  assert.equal(d3.members.length, 2);
  assert.equal(d3.members.find(m => m.nickname === 'Alleen gemiddelde').role, 'owner');
});

test('verlaten en opheffen: laatste lid weg = groep weg; eigenaar heft op', async () => {
  const env = env0();
  const o = await founder(env);
  const g1 = await makeGroup(env, o, 'Eenmalig');
  await ok(await call(env, `/v1/groups/${g1.id}/me`, { method: 'DELETE', token: o.token }));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM groups WHERE id = ?').get(g1.id).n, 0);
  const g2 = await makeGroup(env, o, 'Ophef');
  const lid = await viaInvite(env, (await invite(env, o, g2.id)).token, 'Lid');
  assert.equal((await call(env, `/v1/groups/${g2.id}`, { method: 'DELETE', token: lid.token })).status, 403);
  await ok(await call(env, `/v1/groups/${g2.id}`, { method: 'DELETE', token: o.token }));
  assert.equal((await call(env, `/v1/groups/${g2.id}`, { token: lid.token })).status, 404);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM group_members').get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM group_invites').get().n, 0);
});

test('meerdere groepen per speler, met een maximum; volle groep weigert', async () => {
  const env = env0();
  const o = await founder(env);
  for (let i = 0; i < LIMITS.groupsPerMember; i++) await makeGroup(env, o, 'Groep ' + i);
  assert.equal((await call(env, '/v1/groups', { method: 'POST', token: o.token, body: { name: 'Te veel', share: SHARE_ALL } })).status, 409);
  const mine = await ok(await call(env, '/v1/groups', { token: o.token }));
  assert.equal(mine.groups.length, LIMITS.groupsPerMember);
  const g = mine.groups[0];
  env.DB.raw.prepare('UPDATE groups SET max_members = 2 WHERE id = ?').run(g.id);
  const inv = await invite(env, o, g.id);
  await viaInvite(env, inv.token, 'Twee');
  const derde = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Drie', inviteToken: inv.token, age: 'adult' }, newIp: true }), 201);
  assert.equal((await call(env, '/v1/invites/accept', { method: 'POST', token: derde.token, body: { token: inv.token, share: SHARE_ALL } })).status, 409);
});

test('kinderen: minderjarige accounts kunnen (nog) niet deelnemen', async () => {
  const env = env0();
  const o = await founder(env);
  const g = await makeGroup(env, o);
  const inv = await invite(env, o, g.id);
  assert.equal((await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Kind', inviteToken: inv.token, age: 'minor' } })).status, 403);
  assert.equal((await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Kind', inviteToken: inv.token } })).status, 403);
  // ook een (bijv. later aangemaakt) minderjarig account zonder geverifieerde toestemming wordt server-side geweigerd
  const kid = await viaInvite(env, inv.token, 'Bijna kind');
  env.DB.raw.prepare("UPDATE members SET age_group = 'minor' WHERE handle = ?").run(kid.account.handle);
  assert.equal((await call(env, '/v1/groups', { method: 'POST', token: kid.token, body: { name: 'Kindergroep', share: SHARE_ALL } })).status, 403);
  assert.equal((await call(env, '/v1/invites/accept', { method: 'POST', token: kid.token, body: { token: (await invite(env, o, g.id)).token, share: SHARE_ALL } })).status, 403);
});

test('rate limiting op uitnodigingen en groepswijzigingen', async () => {
  let n = 0;
  const env = env0({ RL_REGISTER: { limit: async () => ({ success: ++n <= 3 }) }, RL_WRITE: { limit: async () => ({ success: false }) } });
  const tok = 'b'.repeat(64);
  for (let i = 0; i < 3; i++) assert.equal((await call(env, '/v1/invites/preview', { method: 'POST', body: { token: tok } })).status, 404);
  assert.equal((await call(env, '/v1/invites/preview', { method: 'POST', body: { token: tok } })).status, 429);
});

test('statistiekvalidatie: best60/best99 alleen bij genoeg pijlen; oude apps zonder deze velden werken', async () => {
  const env = env0();
  const o = await founder(env);
  const put = s => call(env, '/v1/me/snapshots', { method: 'PUT', token: o.token, body: { snapshots: [s] } });
  assert.equal((await put(snap('all', 900, 30, { best60: 1000 }))).status, 400);
  assert.equal((await put(snap('all', 1800, 60, { best60: 3601 }))).status, 400);
  assert.equal((await put(snap('all', 1800, 60, { best60: 1800 }))).status, 200);
  const legacy = snap('all', 900, 30); // zonder best60/best99
  assert.equal((await put(legacy)).status, 200);
});
