import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSnapshots, upsertAccount, getAccount, dropAccount } from '../../js/community-sync.js';

const session = (id, playerId, at, code) => ({
  id, playerId, kind: 'score', finishedAt: at, startedAt: at, limitTurns: 10,
  turns: Array.from({ length: 10 }, () => ({ darts: [code, code, code] }))
});

test('30-pijlenchallenge gebruikt eerste poging, niet hoogste poging', () => {
  const data = { trainings: [
    session('1','a','2026-10-05T10:00:00Z','S10'),
    session('2','a','2026-10-06T10:00:00Z','T20'),
    session('3','a','2026-10-12T10:00:00Z','S20')
  ] };
  const groups = publicSnapshots(data,'a');
  const all = groups.find(x => x.period === 'all');
  const w1 = groups.find(x => x.period === 'week:2026-10-05');
  const w2 = groups.find(x => x.period === 'week:2026-10-12');
  assert.equal(w1.challenge30, 300);
  assert.equal(w1.best30, 1800);
  assert.equal(w1.sessions, 2);
  assert.equal(w2.challenge30, 600);
  assert.equal(all.darts, 90);
  assert.equal(all.points, 2700);
});
test('meerdere spelers worden niet samengevoegd en geen losse pijlen worden gedeeld', () => {
  const data = { trainings: [
    session('1','a','2026-10-05T10:00:00Z','T20'),
    session('2','b','2026-10-05T10:00:00Z','S1')
  ] };
  const results = publicSnapshots(data,'a');
  assert.equal(results.find(x => x.period === 'all').points,1800);
  assert.equal(/\["[SDT]\d|"turns"|"playerId"/.test(JSON.stringify(results)), false, 'geen losse pijlen (het favoriete vak "T20" is een samenvatting)');
  assert.equal(JSON.stringify(results).includes('playerId'),false);
  assert.equal(JSON.stringify(results).includes('2026-10-05T10:00'),false);
});
test('geen afgebroken of van elders geïmporteerde scores op publieke ranglijst', () => {
  const data = { trainings: [
    { ...session('1','a','2026-10-05T10:00:00Z','S20'), summary:{points:600,darts:30}},
    { ...session('2','a','2026-10-05T10:00:00Z','S20'), turns:[{darts:['S20']}] }
  ] };
  assert.deepEqual(publicSnapshots(data,'a'),[]);
});
test('account gekoppeld per lokale speler en verwijderbaar zonder trainingen te wijzigen', () => {
  const memory = new Map();
  const storage = { getItem: k => memory.get(k) || null, setItem:(k,v)=>memory.set(k,v) };
  upsertAccount('a',{token:'secret',enabled:true},storage);
  upsertAccount('b',{token:'other',enabled:false},storage);
  assert.equal(getAccount('a',storage).token,'secret');
  dropAccount('a',storage);
  assert.equal(getAccount('a',storage),null);
  assert.equal(getAccount('b',storage).token,'other');
});

test('gedeelde cijfers: wat nog niet verstuurd is (app dicht, offline) gaat bij de volgende start alsnog mee', async () => {
  const { queueCommunitySync, resumePendingSync, getAccount, upsertAccount } = await import('../../js/community-sync.js');
  const m = new Map(); const st = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  const data = { players: [{ id: 'p1', name: 'Senn' }], trainings: [] };
  upsertAccount('p1', { id: 'x', handle: 'abcdefabcdef', token: 't'.repeat(64), enabled: true }, st);
  const calls = [];
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => { calls.push(init.method); throw new TypeError('offline'); };
    queueCommunitySync(data, ['p1'], {}, st);
    await new Promise(r => setTimeout(r, 10));
    assert.ok(getAccount('p1', st).pendingAt, 'blijft gemarkeerd als het versturen mislukt');
    assert.deepEqual(resumePendingSync({ players: [] }, st), [], 'alleen voor spelers op deze telefoon');
    globalThis.fetch = async (url, init) => { calls.push(init.method); return new Response('{"saved":1}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
    assert.deepEqual(resumePendingSync(data, st), ['p1']);
    await new Promise(r => setTimeout(r, 10));
    assert.equal(getAccount('p1', st).pendingAt, undefined, 'na gelukt versturen niet meer gemarkeerd');
    assert.ok(getAccount('p1', st).lastSync);
    assert.deepEqual(resumePendingSync(data, st), [], 'niets meer te doen');
    assert.deepEqual(calls, ['PUT', 'PUT']);
  } finally { globalThis.fetch = realFetch; }
});

test('1.7.3: alleen het totaal krijgt dagen op rij, badges, ontwikkeling en favoriete vak; weekcijfers niet', () => {
  const day = (n, h = 12) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const few = { trainings: [session('1', 'a', day(1), 'T20'), session('2', 'a', day(0), 'S20')] };
  const all = publicSnapshots(few, 'a').find(x => x.period === 'all');
  assert.equal(all.streak, 2, 'gisteren en vandaag');
  assert.ok(all.badges >= 1, 'eerste training = badge');
  assert.equal(all.favorite, '20', 'meest geraakt: vak 20 (S20 en T20 samen)');
  assert.equal(all.delta10, null, 'minder dan 20 trainingen: geen ontwikkeling');
  const week = publicSnapshots(few, 'a').find(x => x.period !== 'all');
  for (const k of ['streak', 'badges', 'favorite', 'delta10']) assert.equal(k in week, false, 'week zonder ' + k);
  // 20 trainingen: eerst 10 keer S10 (30 per beurt), dan 10 keer S20 (60 per beurt) → +30,00
  const many = { trainings: Array.from({ length: 20 }, (_, i) => session('t' + i, 'a', day(25 - i), i < 10 ? 'S10' : 'S20')) };
  const m = publicSnapshots(many, 'a').find(x => x.period === 'all');
  assert.equal(m.delta10, 30);
  assert.equal(m.favorite, '10', 'even vaak 10 als 20 geraakt: laagste getal eerst, zoals in de trefferkaart');
  // Trainingen van een andere telefoon (alleen samenvatting) tellen mee in de ontwikkeling, niet in het favoriete vak.
  const other = { trainings: [...many.trainings, { id: 'g', playerId: 'a', kind: 'score', source: 'Andere telefoon', finishedAt: day(0), startedAt: day(0), summary: { points: 900, darts: 30, high: 100, tons: 1 } }] };
  const o = publicSnapshots(other, 'a').find(x => x.period === 'all');
  assert.equal(o.sessions, 21);
  assert.equal(o.favorite, '10');
});
