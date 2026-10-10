import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../js/store.js';
import { earnedBadges } from '../../js/achievements.js';

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()], map: m };
}

function sample() {
  const d = S.emptyData();
  const p = S.newPlayer('Sem');
  d.players.push(p);
  d.activePlayerId = p.id;
  d.trainings.push({ id: 't1', playerId: p.id, kind: 'score', limitTurns: 10, startedAt: '2026-10-01T10:00:00.000Z', turns: [{ at: '2026-10-01T10:00:10.000Z', darts: ['T20', 'S5', 'D10'] }] });
  d.matches.push({ id: 'm1', startedAt: '2026-10-02T10:00:00.000Z', settings: { start: 501, bestOf: 1, doubleOut: true }, players: [{ id: p.id, name: 'Sem' }, { id: null, name: 'Papa' }], legs: [{ starter: 0, turns: [{ p: 0, darts: ['T20'] }] }] });
  return d;
}

test('opslaan en opnieuw laden', () => {
  const st = memoryStorage();
  const store = S.createStore(st);
  assert.equal(store.load().source, 'new');
  const d = sample();
  assert.equal(store.save(d), true);
  const again = S.createStore(st).load();
  assert.equal(again.source, 'oche');
  assert.deepEqual(again.data.trainings, d.trainings);
  assert.deepEqual(again.data.matches, d.matches);
});

test('opslagfout wordt gemeld en niet gegooid', () => {
  const store = S.createStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } });
  assert.equal(store.save(sample()), false);
  assert.ok(store.lastError);
});

test('beschadigde gegevens worden apart bewaard, niet weggegooid', () => {
  const st = memoryStorage({ [S.STORAGE_KEY]: '{kapot' });
  const r = S.createStore(st).load();
  assert.equal(r.source, 'new');
  assert.ok(st.keys().some(k => k.startsWith(S.STORAGE_KEY + '.beschadigd.')));
});

test('migratie van Dartlog v1', () => {
  const old = {
    version: 1,
    trainings: [{
      id: 'old1', name: 'Scoretraining', startedAt: '2026-10-08T19:00:00.000Z', dartLimit: 30,
      rounds: [
        { createdAt: '2026-10-08T19:01:00.000Z', score: 85, darts: [
          { notation: 'T20', points: 60, segment: 20, multiplier: 3, double: false, identified: true },
          { notation: '5', points: 5, segment: 5, multiplier: 1, double: false, identified: true },
          { notation: 'D10', points: 20, segment: 10, multiplier: 2, double: true, identified: true },
        ] },
        { createdAt: '2026-10-08T19:02:00.000Z', score: 135, darts: [
          { notation: 'BULL', points: 50, segment: 25, multiplier: 2, double: true, identified: true },
          { notation: '25', points: 25, segment: 25, multiplier: 1, double: false, identified: true },
          { notation: '60', points: 60, segment: null, multiplier: null, double: false, identified: false },
        ] },
        { createdAt: '2026-10-08T19:03:00.000Z', score: 0, darts: ['0', 'T19', 'd16'] },
      ],
    }],
    matches: [],
  };
  const st = memoryStorage({ [S.LEGACY_KEY]: JSON.stringify(old) });
  const r = S.createStore(st).load();
  assert.equal(r.source, 'legacy');
  const t = r.data.trainings[0];
  assert.deepEqual(t.turns.map(x => x.darts), [['T20', 'S5', 'D10'], ['DB', 'SB', 'X60'], ['M', 'T19', 'D16']]);
  assert.equal(t.limitTurns, 10);
  assert.equal(t.playerId, r.data.players[0].id);
  assert.deepEqual(S.validateData(r.data), []);
});

test('back-up export → import geeft dezelfde gegevens', () => {
  const d = sample();
  const r = S.parseBackup(S.makeBackup(d));
  assert.ok(r.data);
  assert.deepEqual(r.data.trainings, d.trainings);
  assert.deepEqual(r.data.players, d.players);
});

test('ongeldige back-ups worden geweigerd', () => {
  assert.ok(S.parseBackup('geen json').error);
  assert.ok(S.parseBackup('{}').error);
  const d = sample();
  d.trainings[0].turns[0].darts = ['T25'];
  assert.ok(S.parseBackup(JSON.stringify(d)).error);
  const d2 = sample();
  d2.trainings[0].playerId = 'onbekend';
  assert.ok(S.parseBackup(JSON.stringify(d2)).error);
  const d3 = sample();
  d3.matches[0].settings.start = 999;
  assert.ok(S.parseBackup(JSON.stringify(d3)).error);
  const d4 = sample();
  d4.trainings[0].turns[0].darts = ['T20', 'T20', 'T20', 'T20'];
  assert.ok(S.parseBackup(JSON.stringify(d4)).error);
});

test('namen worden opgeschoond (geen HTML)', () => {
  assert.equal(S.cleanName('<script>alert(1)</script>Sem'), 'scriptalert(1)/scriptSem');
  assert.equal(S.cleanName('  Sem  '), 'Sem');
  assert.equal(S.cleanName('x'.repeat(40)).length, 24);
});

test('samenvoegen voegt alleen ontbrekende items toe', () => {
  const a = sample();
  const b = structuredClone(a);
  b.trainings.push({ ...a.trainings[0], id: 't2' });
  const m = S.mergeData(a, b);
  assert.equal(m.trainings.length, 2);
  assert.equal(S.mergeData(m, b).trainings.length, 2);
});

test('spelers worden niet samengevoegd in statistieken', () => {
  const d = sample();
  const other = S.newPlayer('Papa', 1);
  d.players.push(other);
  d.trainings.push({ id: 't9', playerId: other.id, kind: 'score', limitTurns: null, startedAt: '2026-10-03T10:00:00.000Z', turns: [{ darts: ['T20', 'T20', 'T20'] }] });
  assert.ok(earnedBadges(d, other.id).has('max'));
  assert.ok(!earnedBadges(d, d.players[0].id).has('max'));
});
