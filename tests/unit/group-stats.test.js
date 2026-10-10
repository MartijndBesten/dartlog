import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, leaderboards, movement, placesOf, avg3, MIN_DARTS_ALL } from '../../js/group-stats.js';
import { publicSnapshots } from '../../js/community-sync.js';

const W = '2026-10-05';
const member = (nickname, { all, week, weeks = [], records, challenge, share = { average: true, records: true, challenge: true } } = {}) => ({
  handle: nickname.toLowerCase().padEnd(12, 'x').slice(0, 12), nickname, role: 'member', share,
  ...(share.average ? { average: { all, week, weeks } } : {}),
  ...(share.records ? { records } : {}),
  ...(share.challenge ? { challenge: { week: W, points: challenge ?? null } } : {}),
});

test('gemiddelde is gewogen per pijl (punten × 3 / pijlen)', () => {
  assert.equal(avg3(900, 30), 90);
  assert.equal(avg3(0, 0), null);
  // 30 pijlen à 60 + 90 pijlen à 30 → (600+900)*3/120 = 37,5 (niet het gemiddelde van de twee gemiddelden)
  assert.equal(avg3(600 + 900, 120), 37.5);
});

test('beste 30/60/99 als gemiddelde per drie pijlen; ontbrekend blijft leeg', () => {
  const s = summarize(member('Senn', { all: { darts: 189, points: 3000, sessions: 3 }, records: { all: { best30: 600, best60: 1100, best99: 1650, highestTurn: 140 }, week: null } }), W);
  assert.equal(s.best30, 60);
  assert.equal(s.best60, 55);
  assert.equal(s.best99, 50);
  const leeg = summarize(member('Mila', { all: { darts: 30, points: 300, sessions: 1 }, records: { all: { best30: 300, best60: null, best99: null } } }), W);
  assert.equal(leeg.best60, null);
});

test('algemene ranglijst pas vanaf 90 pijlen; daaronder "nog te weinig pijlen"', () => {
  const b = leaderboards([
    member('Veel', { all: { darts: MIN_DARTS_ALL, points: 1500, sessions: 3 } }),
    member('Weinig', { all: { darts: 60, points: 1800, sessions: 2 } }),
  ], W);
  assert.deepEqual(b.overall.ranked.map(r => r.nickname), ['Veel']);
  assert.deepEqual(b.overall.waiting.map(r => r.nickname), ['Weinig']);
});

test('weekranglijst vanaf 30 pijlen deze week; gelijke stand: meer pijlen, dan alfabetisch', () => {
  const b = leaderboards([
    member('Bram', { all: { darts: 90, points: 1500, sessions: 3 }, week: { darts: 60, points: 1200, sessions: 2 } }),
    member('Anna', { all: { darts: 90, points: 1500, sessions: 3 }, week: { darts: 30, points: 600, sessions: 1 } }),
    member('Cas', { all: { darts: 90, points: 1500, sessions: 3 }, week: { darts: 30, points: 600, sessions: 1 } }),
    member('Dirk', { all: { darts: 90, points: 1500, sessions: 3 }, week: null }),
  ], W);
  assert.deepEqual(b.week.ranked.map(r => [r.nickname, r.place]), [['Bram', 1], ['Anna', 1], ['Cas', 1]]);
  assert.deepEqual(b.week.waiting.map(r => r.nickname), ['Dirk']);
});

test('verbetering: deze week tegenover de weken ervoor, beide minstens 30 pijlen', () => {
  const s = summarize(member('Groeier', {
    all: { darts: 150, points: 2400, sessions: 5 }, week: { darts: 30, points: 600, sessions: 1 },
    weeks: [{ week: '2026-09-21', darts: 60, points: 900, sessions: 2 }, { week: '2026-09-28', darts: 60, points: 900, sessions: 2 }, { week: W, darts: 30, points: 600, sessions: 1 }],
  }), W);
  assert.equal(s.weekAverage, 60);
  assert.equal(s.improvement, 60 - 45);
  const nieuw = summarize(member('Nieuw', { all: { darts: 30, points: 300, sessions: 1 }, week: { darts: 30, points: 300, sessions: 1 }, weeks: [{ week: W, darts: 30, points: 300, sessions: 1 }] }), W);
  assert.equal(nieuw.improvement, null, 'zonder eerdere weken geen verbetering');
});

test('wie iets niet deelt, staat niet in die ranglijst en wordt niet als 0 getoond', () => {
  const b = leaderboards([
    member('Prive', { share: { average: false, records: false, challenge: false } }),
    member('Open', { all: { darts: 90, points: 1350, sessions: 3 }, records: { all: { highestTurn: 100 } }, challenge: 450 }),
  ], W);
  assert.deepEqual(b.overall.ranked.map(r => r.nickname), ['Open']);
  assert.deepEqual(b.challenge.ranked.map(r => r.nickname), ['Open']);
  assert.equal(b.rows.find(r => r.nickname === 'Prive').average, null);
});

test('record deze week en beweging op de ranglijst', () => {
  const s = summarize(member('Topper', { all: { darts: 90, points: 1500, sessions: 3 }, records: { all: { best30: 700, highestTurn: 140 }, week: { best30: 700, highestTurn: 100 } } }), W);
  assert.equal(s.recordThisWeek, true);
  const ranked = [{ handle: 'a', place: 1 }, { handle: 'b', place: 2 }, { handle: 'c', place: 3 }];
  assert.deepEqual(movement(ranked, { a: 2, b: 1 }), { a: 1, b: -1, c: 0 });
  assert.deepEqual(placesOf(ranked), { a: 1, b: 2, c: 3 });
});

test('app deelt beste 60- en 99-pijlentraining, nooit losse pijlen', () => {
  const turn = d => ({ at: '2026-10-06T10:00:00Z', darts: d });
  const t = (id, n, darts) => ({ id, playerId: 'p', kind: 'score', finishedAt: '2026-10-06T10:00:00Z', turns: Array.from({ length: n }, () => turn(darts)) });
  const data = { trainings: [t('a', 20, ['S20', 'S20', 'S20']), t('b', 33, ['S10', 'S10', 'S10']), t('c', 10, ['S5', 'S5', 'S5'])] };
  const [all] = publicSnapshots(data, 'p');
  assert.equal(all.best60, 1200);
  assert.equal(all.best99, 990);
  assert.equal(all.best30, 150);
  assert.equal(JSON.stringify(all).includes('S20'), false);
});
