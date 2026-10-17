import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, earnedBadges, activityDates } from '../../js/achievements.js';
import { dayStreak, longestStreak } from '../../js/logic.js';

const P = 'p1';
const base = (trainings = [], matches = []) => ({ version: 2, players: [{ id: P, name: 'Senn' }, { id: 'p2', name: 'Papa' }], trainings, matches, settings: {}, active: { training: null, match: null } });
const day = (d, h = 18) => new Date(2026, 9, d, h, 0).toISOString();          // lokale tijd, oktober 2026
const tr = (d, turns, extra = {}) => ({ id: 't' + d + Math.random(), playerId: P, kind: 'score', limitTurns: null, startedAt: day(d), turns: turns.map(darts => ({ darts })), ...extra });
const turnsOf = (n, darts) => Array.from({ length: n }, () => darts);
// Wedstrijd op deze telefoon: Senn (0) tegen Papa (1), Senn gooit 501 uit: 180, 180 en dan 141 (T20 T19 D12).
function match(d, { finish = ['T20', 'T19', 'D12'], vsOther = true, id } = {}) {
  const turns = [];
  for (let i = 0; i < 2; i++) { turns.push({ p: 0, darts: ['T20', 'T20', 'T20'] }); if (vsOther) turns.push({ p: 1, darts: ['S1', 'S1', 'S1'] }); }
  turns.push({ p: 0, darts: finish });
  return { id: id || 'm' + d, startedAt: day(d), settings: { start: 501, bestOf: 1, doubleOut: true }, players: vsOther ? [{ id: P, name: 'Senn' }, { id: 'p2', name: 'Papa' }] : [{ id: P, name: 'Senn' }], legs: [{ starter: 0, turns }] };
}

test('reeks: een dag met alleen een wedstrijd telt mee (thuisscherm en badges gelijk)', () => {
  const d = base([tr(10, [['S20', 'S20', 'S20']]), tr(12, [['S20', 'S20', 'S20']])], [match(11)]);
  const onlyTrainings = d.trainings.map(t => t.startedAt);
  assert.equal(longestStreak(onlyTrainings), 1, 'zo was het: gat op dag 11');
  const dates = activityDates(d, P);
  assert.equal(longestStreak(dates), 3);
  assert.equal(dayStreak(dates, new Date(2026, 9, 12, 21)), 3);
  assert.ok(earnedBadges(d, P).has('streak3'));
  assert.equal(activityDates(d, 'p2').length, 1, 'tegenstander op deze telefoon: alleen de wedstrijd');
});

test('reeks: trainingen zonder datum (uit een andere app) tellen niet, gastresultaten met datum wel', () => {
  const d = base([tr(10, []), { ...tr(11, []), dateUnknown: true }, { ...tr(11, []), id: 'gast-x', summary: { points: 300, darts: 30 } }]);
  assert.equal(activityDates(d, P).length, 2);
  assert.equal(longestStreak(activityDates(d, P)), 2);
});

test('20 nieuwe badges, met unieke id\'s en een korte uitleg', () => {
  assert.equal(BADGES.length, 39);
  assert.equal(new Set(BADGES.map(b => b.id)).size, 39);
  for (const b of BADGES) assert.ok(b.icon && b.name && b.desc.length < 70, b.id);
});

test('badges uit losse pijlen: drieling, Shanghai, T20-jager, stierenvechter, dubbelverzamelaar', () => {
  const none = earnedBadges(base([tr(1, [['S20', 'S20', 'M'], ['M', 'M', 'M'], ['S20', 'D20', 'S20']])]), P);
  for (const id of ['drieling', 'shanghai', 't20jager', 'bull10', 'dubbels']) assert.ok(!none.has(id), 'nog niet: ' + id);
  const e = earnedBadges(base([
    tr(1, [['S19', 'S19', 'S19'], ['T20', 'S20', 'D20'], ...turnsOf(17, ['T20', 'T20', 'T20'])]),
    tr(2, [...Array.from({ length: 20 }, (_, i) => ['D' + (i + 1), 'M', 'M']), ...turnsOf(5, ['DB', 'DB', 'S1'])]),
  ]), P);
  for (const id of ['drieling', 'shanghai', 't20jager', 'bull10', 'dubbels']) assert.ok(e.has(id), id);
  assert.ok(!earnedBadges(base([tr(1, [['T20', 'S20', 'D19']])]), P).has('shanghai'), 'Shanghai: hetzelfde getal');
  assert.ok(!earnedBadges(base([tr(1, [['S20', 'S20']])]), P).has('drieling'), 'drieling: 3 pijlen');
});

test('badges per training: vijf keer 100+, op koers, geen mis, lange adem, samen sterk', () => {
  const e = earnedBadges(base([
    tr(1, [...turnsOf(5, ['T20', 'S20', 'S20']), ...turnsOf(5, ['S5', 'S5', 'S5'])]),
    tr(2, turnsOf(33, ['S1', 'S1', 'S1'])),
    tr(3, [['S20', 'S20', 'S20']], { groupPlayers: [P, 'p2'] }),
  ]), P);
  for (const id of ['ton5', 'opkoers', 'geenmis', 'langeadem', 'samen']) assert.ok(e.has(id), id);
  const n = earnedBadges(base([tr(1, [...turnsOf(4, ['T20', 'S20', 'S20']), ['S1', 'S1', 'S1'], ['S20', 'S20', 'S20'], ...turnsOf(4, ['S5', 'M', 'S5'])])]), P);
  for (const id of ['ton5', 'opkoers', 'geenmis', 'langeadem', 'samen']) assert.ok(!n.has(id), 'nog niet: ' + id);
  assert.ok(!earnedBadges(base([tr(1, [...turnsOf(9, ['S1', 'S1', 'S1']), ['S1', 'S1']])]), P).has('geenmis'), 'geen mis: minstens 30 pijlen');
});

test('badges over langere tijd: hattrick, honderd keer 100+, 100 trainingen, twee weken, vaste gast', () => {
  const d = base([
    ...Array.from({ length: 14 }, (_, i) => tr(i + 1, [['T20', 'T20', 'T20']])),
    ...Array.from({ length: 86 }, (_, i) => ({ ...tr(1, turnsOf(1, ['T20', 'S20', 'S20'])), startedAt: new Date(2026, 6, 1 + (i % 16), 12).toISOString() })),
  ]);
  const e = earnedBadges(d, P);
  for (const id of ['hattrick', 'ton100', 't100', 'streak14', 'days30']) assert.ok(e.has(id), id);
  const few = earnedBadges(base(Array.from({ length: 13 }, (_, i) => tr(i + 1, [['S1', 'S1', 'S1']]))), P);
  for (const id of ['hattrick', 'ton100', 't100', 'streak14', 'days30']) assert.ok(!few.has(id), 'nog niet: ' + id);
  assert.ok(few.has('streak7') && few.has('t10'));
});

test('badges in wedstrijden: uitgegooid (ook alleen), winnaar, Big Fish, uitwedstrijd; rond de klok in 30', () => {
  const solo = earnedBadges(base([], [match(1, { vsOther: false })]), P);
  assert.ok(solo.has('uitgegooid') && !solo.has('win'), 'alleen uitgooien telt, winnen niet');
  const ten = earnedBadges(base([], Array.from({ length: 10 }, (_, i) => match(i + 1))), P);
  assert.ok(ten.has('win10') && ten.has('co100'));
  assert.ok(!earnedBadges(base([], Array.from({ length: 9 }, (_, i) => match(i + 1))), P).has('win10'));
  // 170 uit: 501 - 180 - 151 = 170, dan T20 T20 bull
  const fish = { ...match(1), legs: [{ starter: 0, turns: [
    { p: 0, darts: ['T20', 'T20', 'T20'] }, { p: 1, darts: ['S1', 'S1', 'S1'] }, { p: 0, darts: ['T20', 'T17', 'D20'] },
    { p: 1, darts: ['S1', 'S1', 'S1'] }, { p: 0, darts: ['T20', 'T20', 'DB'] }] }] };
  assert.ok(earnedBadges(base([], [fish]), P).has('bigfish'));
  assert.ok(!earnedBadges(base([], [match(1)]), P).has('bigfish'));
  const guest = { id: 'gast-abc', startedAt: day(3), settings: { start: 501, bestOf: 1, doubleOut: true }, players: [{ id: P, name: 'Senn' }, { id: null, name: 'Tegenstander' }], legs: [],
    summary: { me: 0, won: [1, 0], winner: 0, darts: 24, points: 501, high: 140, bestCheckout: 81, t100: 2, t140: 1, t180: 0 } };
  const g = earnedBadges(base([], [guest]), P);
  assert.ok(g.has('uitwedstrijd') && g.has('uitgegooid') && g.has('win'));
  const c = { id: 'c30', playerId: P, kind: 'clock', startedAt: day(1), turns: [] };
  const seq = [...Array.from({ length: 20 }, (_, i) => 'S' + (i + 1)), ...Array(9).fill('M'), 'SB'];
  for (let i = 0; i < seq.length; i += 3) c.turns.push({ darts: seq.slice(i, i + 3) });
  assert.ok(earnedBadges(base([c]), P).has('clock30'));
  const slow = { ...c, id: 'slow', turns: [...c.turns.slice(0, -1), { darts: ['M', 'M', 'M'] }, c.turns[c.turns.length - 1]] };
  assert.ok(!earnedBadges(base([slow]), P).has('clock30') && earnedBadges(base([slow]), P).has('clock40'));
});
