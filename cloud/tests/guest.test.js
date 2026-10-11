// Spelen op een andere telefoon: koppelcodes en inbox. Fictieve spelers en scores.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';
import { trainingOkay, normalizeCode } from '../src/guest.js';

const ORIGIN = 'https://martijndbesten.github.io';
const API = 'https://api.okkiedarts.nl';
const FOUNDER = 'oprichter-gast-test-0000000001';
const env0 = (extra = {}) => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, GROUPS_ENABLED: 'true', REGISTRATION_ENABLED: 'false', GROUP_FOUNDER_CODE: FOUNDER, MINORS_OPEN: 'true', ...extra });
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async u => { throw new Error('Onverwachte externe aanroep: ' + u); }; });
after(() => { globalThis.fetch = realFetch; });
let ip = 0;
const call = (env, path, { method = 'GET', body, token } = {}) => {
  const h = { Origin: ORIGIN, 'CF-Connecting-IP': `10.1.${ip >> 8 & 255}.${ip++ & 255}` };
  if (token) h.Authorization = 'Bearer ' + token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return worker.fetch(new Request(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
};
const ok = async (res, status = 200) => { const b = await res.json(); assert.equal(res.status, status, JSON.stringify(b)); return b; };
const SHARE = { average: true, records: true, challenge: true };
const today = new Date().toISOString().slice(0, 10);
const tr = (id, points = 900, darts = 30, extra = {}) => ({ id, date: today, darts, points, high: 100, tons: 1, t140: 0, t180: 0, ...extra });

async function setup() {
  const env = env0();
  const senn = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Senn', founderCode: FOUNDER, age: 'adult' } }), 201);
  const { group } = await ok(await call(env, '/v1/groups', { method: 'POST', token: senn.token, body: { name: 'Dartvrienden', share: SHARE } }), 201);
  const { invite } = await ok(await call(env, `/v1/groups/${group.id}/invites`, { method: 'POST', token: senn.token, body: {} }), 201);
  const join = async nickname => {
    const a = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname, inviteToken: invite.token, age: 'adult' } }), 201);
    await ok(await call(env, '/v1/invites/accept', { method: 'POST', token: a.token, body: { token: invite.token, share: SHARE } }), 201);
    return a;
  };
  return { env, senn, bram: await join('Bram'), lotte: await join('Lotte'), group, invite };
}
const pass = async (env, acc) => (await ok(await call(env, '/v1/me/guest-pass', { method: 'POST', token: acc.token }), 201)).code;
const send = (env, code, training) => call(env, '/v1/guest/training', { method: 'POST', body: { code, training } });
const inbox = async (env, acc) => (await ok(await call(env, '/v1/me/inbox', { token: acc.token }))).trainings;

test('koppelcode: alleen met eigen profiel, 8 tekens, leesbaar, niet te raden uit een naam', async () => {
  const { env, senn } = await setup();
  assert.equal((await call(env, '/v1/me/guest-pass', { method: 'POST' })).status, 401);
  const code = await pass(env, senn);
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizeCode(' ' + code.toLowerCase().replace('-', ' ') + ' '), code.replace('-', ''));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM guest_passes WHERE code_hash LIKE ?').get('%' + code.replace('-', '') + '%').n, 0, 'code alleen gehasht');
  // voorbeeld toont alleen de voornaam
  assert.deepEqual(await ok(await call(env, '/v1/guest/preview', { method: 'POST', body: { code } })), { nickname: 'Senn' });
  // een naam of willekeurige code werkt niet
  for (const c of ['Senn', 'AAAA-AAAA', '', 12345678]) assert.equal((await call(env, '/v1/guest/preview', { method: 'POST', body: { code: c } })).status, 404);
  for (let i = 0; i < 4; i++) await pass(env, senn);
  assert.equal((await call(env, '/v1/me/guest-pass', { method: 'POST', token: senn.token })).status, 409, 'maximaal 5 open codes');
});

test('één code = precies één training; opnieuw versturen geeft geen dubbele; code geeft verder geen toegang', async () => {
  const { env, senn } = await setup();
  const code = await pass(env, senn);
  const r = await ok(await send(env, code, tr('training-bij-bram-1')), 201);
  assert.equal(r.nickname, 'Senn');
  // netwerkfout → dezelfde training nog eens: al ontvangen, geen tweede
  assert.equal((await ok(await send(env, code, tr('training-bij-bram-1')))).already, true);
  assert.equal((await inbox(env, senn)).length, 1);
  // een andere training met dezelfde code: geweigerd
  assert.equal((await send(env, code, tr('training-bij-bram-2'))).status, 404);
  assert.equal((await call(env, '/v1/guest/preview', { method: 'POST', body: { code } })).status, 404);
  // de code is geen inlogsleutel
  for (const p of ['/v1/me', '/v1/groups', '/v1/me/inbox']) assert.equal((await call(env, p, { token: code })).status, 401);
  // verlopen code
  const old = await pass(env, senn);
  env.DB.raw.prepare("UPDATE guest_passes SET expires_at = datetime('now','-1 minute') WHERE used_at IS NULL").run();
  assert.equal((await send(env, old, tr('training-te-laat'))).status, 404);
});

test('trainingsgegevens moeten kloppen; geen losse pijlen of tijden', async () => {
  const bad = [
    tr('kort'), tr('training-x', 1801, 30), tr('training-x', 900, 30, { high: 181 }), tr('training-x', 900, 30, { t180: 1, t140: 1, tons: 1, high: 140 }),
    tr('training-x', 900, 30, { date: '2099-01-01' }), tr('training-x', 900, 30, { date: '2020-01-01' }), tr('training-x', 900, 30, { tons: 11 }),
    tr('training-x', 900, 30, { tons: 1, high: 99 }), { ...tr('training-x'), darts: 2 }, null,
  ];
  for (const t of bad) assert.equal(trainingOkay(t), false, JSON.stringify(t));
  assert.equal(trainingOkay(tr('training-goed')), true);
  const { env, senn } = await setup();
  const code = await pass(env, senn);
  assert.equal((await send(env, code, { ...tr('training-goed'), darts: [['T20']] })).status, 400);
  await ok(await send(env, code, { ...tr('training-goed'), turns: [['T20', 'T20', 'T20']], startedAt: '2026-10-10T20:15:00Z' }), 201);
  const cols = env.DB.raw.prepare("SELECT name FROM pragma_table_info('guest_inbox')").all().map(c => c.name);
  assert.equal(cols.some(c => /turn|dart_list|started|time/i.test(c)), false, 'alleen dag en samenvatting');
});

test('inbox: alleen de eigenaar ziet hem; bevestigen wist online', async () => {
  const { env, senn, bram } = await setup();
  await ok(await send(env, await pass(env, senn), tr('t-senn-1')), 201);
  await ok(await send(env, await pass(env, senn), tr('t-senn-2', 600)), 201);
  assert.deepEqual((await inbox(env, bram)), [], 'Bram ziet Senns inbox niet');
  const items = await inbox(env, senn);
  assert.deepEqual(items.map(i => i.id).sort(), ['t-senn-1', 't-senn-2']);
  await ok(await call(env, '/v1/me/inbox/ack', { method: 'POST', token: bram.token, body: { ids: ['t-senn-1'] } }));
  assert.equal((await inbox(env, senn)).length, 2, 'Bram kan Senns inbox niet legen');
  await ok(await call(env, '/v1/me/inbox/ack', { method: 'POST', token: senn.token, body: { ids: ['t-senn-1', 't-senn-2'] } }));
  assert.deepEqual(await inbox(env, senn), []);
  // opschoning: oude inbox en verlopen codes
  await ok(await send(env, await pass(env, senn), tr('t-senn-3')), 201);
  env.DB.raw.prepare("UPDATE guest_inbox SET received_at = datetime('now','-61 days')").run();
  await worker.scheduled({}, env);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM guest_inbox').get().n, 0);
});

test('drie spelers, twee telefoons, meerdere trainingen: geen dubbele of verloren trainingen', async () => {
  const { env, senn, bram, lotte } = await setup();
  // Telefoon van Bram: Senn en Lotte spelen twee trainingen mee (elk per training een eigen code)
  const sent = [];
  for (const round of [1, 2]) {
    for (const [acc, name] of [[senn, 'senn'], [lotte, 'lotte']]) {
      const id = `bram-tel-${name}-${round}`;
      const code = await pass(env, acc);
      await ok(await send(env, code, tr(id, 600 + round * 30)), 201);
      // de telefoon was even offline en verstuurt alles nog eens
      await ok(await send(env, code, tr(id, 600 + round * 30)));
      sent.push(id);
    }
  }
  assert.deepEqual((await inbox(env, senn)).map(t => t.id).sort(), ['bram-tel-senn-1', 'bram-tel-senn-2']);
  assert.deepEqual((await inbox(env, lotte)).map(t => t.id).sort(), ['bram-tel-lotte-1', 'bram-tel-lotte-2']);
  assert.deepEqual(await inbox(env, bram), []);
  // Senn haalt op maar zijn ack gaat verloren: de inbox blijft staan tot hij wel bevestigt (niets verloren)
  assert.equal((await inbox(env, senn)).length, 2);
  // Senns eigen telefoon synchroniseert daarna zijn totalen (eigen + opgehaalde trainingen) als enige bron
  const snaps = [{ period: 'all', darts: 150, points: 3000, sessions: 5, highestTurn: 100, hits100: 5, hits140: 0, hits180: 0, best30: 690, best60: null, best99: null, challenge30: 690 }];
  await ok(await call(env, '/v1/me/snapshots', { method: 'PUT', token: senn.token, body: { snapshots: snaps } }));
  // een nieuwe telefoon (herstel) met lege opslag kan die cijfers niet ongemerkt wissen
  const shrink = await call(env, '/v1/me/snapshots', { method: 'PUT', token: senn.token, body: { snapshots: [] } });
  assert.equal(shrink.status, 409);
  assert.equal(env.DB.raw.prepare("SELECT darts FROM stats s JOIN members m ON m.id = s.member_id WHERE m.nickname = 'Senn' AND period = 'all'").get().darts, 150);
});

test('jonger dan 16: koppelcode pas met toestemming voor een groep; standaard uit zonder GROUPS_ENABLED', async () => {
  const { env, senn, invite } = await setup();
  const kid = await ok(await call(env, '/v1/register', { method: 'POST', body: { nickname: 'Daan', inviteToken: invite.token, age: 'minor' } }), 201);
  const r = await call(env, '/v1/me/guest-pass', { method: 'POST', token: kid.token });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).needsParent, true);
  const req = await ok(await call(env, '/v1/consent/request', { method: 'POST', token: kid.token, body: { inviteToken: invite.token, share: SHARE } }), 201);
  await ok(await call(env, '/v1/consent/confirm', { method: 'POST', body: { token: req.token, parent: true } }));
  assert.match(await pass(env, kid), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const off = { ...env, GROUPS_ENABLED: 'false' };
  assert.equal((await call(off, '/v1/me/guest-pass', { method: 'POST', token: senn.token })).status, 404);
  assert.equal((await call(off, '/v1/guest/preview', { method: 'POST', body: { code: 'ABCD-EFGH' } })).status, 404);
});

// ---------- Koppelcode bij een 301/501-wedstrijd (1.6.0) ----------
const mt = (id, extra = {}) => ({ id, date: today, start: 501, bestOf: 3, doubleOut: true, players: 2, me: 1, won: [1, 2], winner: 1, stopped: false,
  darts: 120, points: 1210, high: 140, bestCheckout: 81, t100: 3, t140: 1, t180: 0, ...extra });
const sendMatch = (env, code, match) => call(env, '/v1/guest/match', { method: 'POST', body: { code, match } });

test('wedstrijd: uitslag komt bij de eigen speler, als wedstrijd (niet als training), nooit dubbel, code daarna verbruikt', async () => {
  const { env, senn } = await setup();
  const code = await pass(env, senn);
  await ok(await sendMatch(env, code, mt('wedstrijd-0001')), 201);
  await ok(await sendMatch(env, code, mt('wedstrijd-0001')), 200);   // opnieuw versturen (offline/netwerkfout): geen dubbele
  assert.equal((await sendMatch(env, code, mt('wedstrijd-0002'))).status, 404, 'één code = één sessie');
  assert.equal((await send(env, code, tr('training-0009'))).status, 404, 'ook niet daarna nog een training');
  const box = await ok(await call(env, '/v1/me/inbox', { token: senn.token }));
  assert.deepEqual(box.trainings, [], 'oudere apps (alleen `trainings`) zien de wedstrijd niet als training');
  assert.equal(box.matches.length, 1);
  const m = box.matches[0];
  assert.equal(m.id, 'wedstrijd-0001');
  assert.deepEqual([m.start, m.me, m.winner, m.won.join('-'), m.darts, m.points, m.high, m.bestCheckout, m.t100], [501, 1, 1, '1-2', 120, 1210, 140, 81, 3]);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM stats').get().n, 0, 'telt niet mee in gedeelde (Darters) cijfers');
  await ok(await call(env, '/v1/me/inbox/ack', { method: 'POST', token: senn.token, body: { ids: ['wedstrijd-0001'] } }));
  assert.equal((await ok(await call(env, '/v1/me/inbox', { token: senn.token }))).matches.length, 0);
});

test('wedstrijd: gestopt zonder winnaar mag; verzonnen of onmogelijke uitslagen niet', async () => {
  const { env, senn } = await setup();
  await ok(await sendMatch(env, await pass(env, senn), mt('wedstrijd-stop1', { won: [1, 0], winner: null, stopped: true, bestCheckout: 0, points: 300, darts: 30, me: 1, high: 100, t100: 1, t140: 0 })), 201);
  const c = await pass(env, senn);
  for (const bad of [
    { winner: 0 },                                   // winnaar zonder genoeg legs
    { winner: null, stopped: false },                // klaar maar geen winnaar
    { won: [2, 2], winner: 1 },                      // twee winnaars
    { points: 9999 },                                // meer punten dan kan
    { bestCheckout: 171 },                           // geen bestaande finish
    { t180: 1 },                                     // 180 zonder hoogste beurt 180
    { players: 1, won: [2], me: 0, winner: 0 },      // solo hoort niet bij een koppelcode
    { date: '2020-01-01' },
  ]) assert.equal((await sendMatch(env, c, mt('wedstrijd-fout', bad))).status, 400, JSON.stringify(bad));
});
