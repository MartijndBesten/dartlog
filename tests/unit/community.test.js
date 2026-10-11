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
  assert.equal(JSON.stringify(results).includes('T20'),false);
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
