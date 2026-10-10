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
