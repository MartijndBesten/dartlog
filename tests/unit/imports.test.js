import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../js/logic.js';
import * as S from '../../js/store.js';
import { dartCounterTrainings, DARTCOUNTER_SET } from '../../js/imports.js';
import { earnedBadges } from '../../js/achievements.js';

test('DartCounter-gemiddelden komen exact overeen met de screenshots', () => {
  const expected = [40.79, 37.39, 42.30, 38.52, 35.48, 41.48, 34.00, 38.33, 40.55, 36.21];
  const list = dartCounterTrainings('p1');
  assert.equal(list.length, 10);
  list.forEach((t, i) => {
    const tot = L.trainingTotals(t);
    assert.equal(tot.darts, 99);
    assert.equal(L.round2(tot.avg), expected[i], `training ${i + 1}`);
    assert.equal(t.limitTurns, 33, 'telt mee bij filter 99 pijlen');
    assert.equal(t.dateUnknown, true);
  });
});

test('DartCounter-set: vaste id’s per speler en geldige gegevens', () => {
  const d = S.emptyData();
  const p = S.newPlayer('Senn');
  d.players.push(p);
  d.activePlayerId = p.id;
  d.trainings.push(...dartCounterTrainings(p.id));
  assert.deepEqual(S.validateData(d), []);
  assert.equal(new Set(d.trainings.map(t => t.id)).size, 10);
  assert.deepEqual(dartCounterTrainings(p.id).map(t => t.id), d.trainings.map(t => t.id));
  // overleeft een back-up
  const r = S.parseBackup(S.makeBackup(d));
  assert.equal(r.data.trainings.length, 10);
  assert.ok(DARTCOUNTER_SET.sessions.every(s => s.points > 0));
  // badges: hoogste beurt 125 → minstens één 100+
  assert.ok(earnedBadges(d, p.id).has('ton'));
  assert.ok(!earnedBadges(d, p.id).has('max'));
});

test('handmatige eindstand: validatie', () => {
  assert.ok(S.summaryTraining({ playerId: 'p', points: 1200, darts: 99, high: 100 }));
  assert.equal(S.summaryTraining({ playerId: 'p', points: 1200, darts: 99, high: 181 }), null);
  assert.equal(S.summaryTraining({ playerId: 'p', points: 6000, darts: 99 }), null, 'meer dan 60 per pijl');
  assert.equal(S.summaryTraining({ playerId: 'p', points: 50, darts: 0 }), null);
  assert.equal(S.summaryTraining({ playerId: 'p', points: 'abc', darts: 99 }), null);
  const t = S.summaryTraining({ playerId: 'p', points: 900, darts: 90, high: '', date: '2026-10-05' });
  assert.equal(t.summary.high, null);
  assert.equal(t.dateUnknown, undefined);
  assert.equal(t.startedAt.slice(0, 10), '2026-10-05');
  assert.equal(L.trainingTotals(t).avg, 30);
});

test('eindstand + normale training: gewogen gemiddelde over alle pijlen', () => {
  const a = S.summaryTraining({ playerId: 'p', points: 1188, darts: 99 }); // 36
  const b = { turns: [{ darts: ['T20', 'T20', 'T20'] }] }; // 180 in 3
  const ta = L.trainingTotals(a), tb = L.trainingTotals(b);
  assert.equal(L.avg3(ta.points + tb.points, ta.darts + tb.darts), ((1188 + 180) / 102) * 3);
});

test('back-ups van de oude merknaam (oche) blijven inleesbaar', () => {
  const d = S.emptyData();
  const p = S.newPlayer('Senn');
  d.players.push(p);
  const old = JSON.stringify({ app: 'oche', data: d });
  assert.ok(S.parseBackup(old).data);
  assert.equal(JSON.parse(S.makeBackup(d)).app, 'okkie');
});
