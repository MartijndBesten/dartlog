// "Vandaag oefenen" (js/coach.js): vaste regels en drempels, en het weekdoel. Geen AI, geen netwerk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../js/coach.js';
import * as D from '../../js/drills.js';
import { trainingTotals, clockState } from '../../js/logic.js';

const P = 'p1';
const NOW = new Date(2026, 10, 12, 18, 0);   // donderdag 12 november 2026, 18:00 lokale tijd
const day = (offset, h = 10) => { const d = new Date(2026, 10, 12 + offset, h, 0); return d.toISOString(); };
const base = () => ({ players: [{ id: P, name: 'Sem' }], trainings: [], matches: [], drills: [], settings: {} });
const bobsTurns = (hits, at) => D.BOBS_TARGETS.slice(0, hits.length).map((target, i) => ({ at, target, hits: hits[i] }));
const bobs = (id, at, hits) => ({ id, playerId: P, kind: 'bobs27', startedAt: at, finishedAt: at, turns: bobsTurns(hits, at) });
const c121 = (id, at, turns) => ({ id, playerId: P, kind: 'c121', startedAt: at, finishedAt: at, turns });
const clock = (id, at) => ({ id, playerId: P, kind: 'clock', limitTurns: null, startedAt: at, finishedAt: at, turns: [{ at, darts: ['S1', 'S2', 'S3'] }] });

test('regel 1: geen gerichte oefening in 7 dagen → de oefening die het langst geleden is (nooit gedaan eerst)', () => {
  const d = base();
  let a = C.coachAdvice(d, P, NOW);
  assert.equal(a.rule, 'stale'); assert.equal(a.drill, 'bobs27', "nog niets gedaan: begin met Bob's 27");
  d.drills.push(bobs('b', day(-20), [1]));
  a = C.coachAdvice(d, P, NOW);
  assert.equal(a.rule, 'stale'); assert.equal(a.drill, 'c121', 'nooit gedaan gaat voor');
  d.drills.push(c121('c', day(-9), [{ at: day(-9), target: 121, darts: ['S1'] }]));
  d.trainings.push(clock('k', day(-8)));
  a = C.coachAdvice(d, P, NOW);
  assert.equal(a.rule, 'stale'); assert.equal(a.drill, 'bobs27', 'alles ouder dan 7 dagen: de oudste');
  assert.ok(a.why.some(w => w.includes('20 dagen geleden')), 'Waarom noemt het aantal dagen');
  d.trainings.push(clock('k2', day(-7)));
  assert.notEqual(C.coachAdvice(d, P, NOW).rule, 'stale', '7 dagen geleden telt nog als recent');
});

test('regel 3: zwakke dubbels pas bij minstens 30 pijlen per dubbel, anders eerlijk "nog te weinig gegooid"', () => {
  const d = base();
  d.trainings.push(clock('k', day(0)));
  // 9 rondes Bob's 27 = 27 pijlen per dubbel: te weinig.
  for (let i = 0; i < 9; i++) d.drills.push(bobs('b' + i, day(-i), Array(21).fill(1)));
  let a = C.coachAdvice(d, P, NOW);
  assert.notEqual(a.rule, 'weakDoubles');
  assert.ok(a.why.some(w => w.includes('nog te weinig gegooid') && w.includes('27')), 'noemt de drempel en het aantal');
  // 10e ronde: 30 pijlen per dubbel. D16 en D8 zijn zwak.
  const hits = Array(21).fill(1); hits[15] = 0; hits[7] = 0;
  d.drills.push(bobs('b9', day(0, 9), hits));
  for (const x of d.drills) x.turns.forEach((t, i) => { if (i === 15 || i === 7) t.hits = 0; });
  d.drills[0].turns[7].hits = 2;   // D8: 2 van 30 raak; D16: 0 van 30
  a = C.coachAdvice(d, P, NOW);
  assert.equal(a.rule, 'weakDoubles'); assert.equal(a.drill, 'bobs27');
  assert.match(a.text, /^D16 en D8 raak je het minst: 0 en 2 keer raak/);
  assert.ok(a.why.some(w => w === 'D16: 0 van 30 pijlen raak (0%).'));
  assert.ok(a.why.some(w => w === 'D8: 2 van 30 pijlen raak (7%).'));
});

test('regel 3: een geraden mikpunt telt nooit (gewone trainingen en wedstrijden doen niet mee)', () => {
  const d = base();
  d.trainings.push(clock('k', day(0)));
  // Heel veel gemiste D16's in scoretrainingen en wedstrijden: geen vast doel, dus geen uitspraak.
  for (let i = 0; i < 30; i++) d.trainings.push({ id: 's' + i, playerId: P, kind: 'score', limitTurns: 10, startedAt: day(-1), finishedAt: day(-1), turns: Array(10).fill({ darts: ['S16', 'S8', 'D16'] }) });
  d.matches.push({ id: 'm', startedAt: day(-1), settings: { start: 501, bestOf: 1, doubleOut: true }, players: [{ id: P, name: 'Sem' }], legs: [{ starter: 0, turns: Array(40).fill({ p: 0, darts: ['S16', 'S16', 'S16'] }) }] });
  assert.deepEqual(D.doubleStats(d.drills, P), []);
  const a = C.coachAdvice(d, P, NOW);
  assert.notEqual(a.rule, 'weakDoubles');
  assert.ok(a.why.some(w => w.includes('nog te weinig gegooid')));
});

test('regel 3: dubbels die dicht bij elkaar liggen worden niet "zwak" genoemd', () => {
  const d = base();
  d.trainings.push(clock('k', day(0)));
  for (let i = 0; i < 10; i++) d.drills.push(bobs('b' + i, day(-i), Array(21).fill(1)));
  const a = C.coachAdvice(d, P, NOW);
  assert.notEqual(a.rule, 'weakDoubles');
  assert.ok(a.why.some(w => w.includes('liggen dicht bij elkaar')));
});

test('regel 2: 121-niveau twee opeenvolgende weken gelijk → Rond de klok · dubbels', () => {
  const ok121 = [{ at: '', target: 121, darts: ['T20', 'T11', 'D14'] }, { at: '', target: 122, darts: ['T20', 'T14', 'D10'] }];
  const d = base();
  d.drills.push(c121('a', day(-8), ok121), c121('b', day(-1), ok121));   // week 45 en 46: niveau 122
  let a = C.coachAdvice(d, P, NOW);
  assert.equal(a.rule, 'c121flat'); assert.equal(a.drill, 'clockD');
  assert.ok(a.why.some(w => w.includes('week 45: 122') && w.includes('week 46: 122')));
  d.drills = [c121('a', day(-15), ok121), c121('b', day(-1), ok121)];   // week 44 en 46: niet opeenvolgend
  assert.notEqual(C.coachAdvice(d, P, NOW).rule, 'c121flat');
  d.drills = [c121('a', day(-8), ok121), c121('b', day(-1), ok121.slice(0, 1))];   // 122 → 121: niet gelijk
  assert.notEqual(C.coachAdvice(d, P, NOW).rule, 'c121flat');
});

test('regel 4: gemiddelde zakt binnen scoretrainingen (2 van de laatste 3, 3 punten of meer) → kortere sessies', () => {
  const d = base();
  d.drills.push(bobs('b', day(0), [1]));
  const tr = (id, first, second) => ({ id, playerId: P, kind: 'score', limitTurns: 20, startedAt: day(-1), finishedAt: day(-1),
    turns: [...Array(10).fill({ darts: ['S20', 'S20', `S${first - 40}`] }), ...Array(10).fill({ darts: ['S20', 'S20', `S${second - 40}`] })] });
  d.trainings.push(tr('a', 60, 57), tr('b', 55, 52), tr('c', 50, 50));
  let a = C.coachAdvice(d, P, NOW);
  assert.equal(a.rule, 'decline');
  assert.ok(a.why.some(w => w.includes('eerste helft 60,0, tweede helft 57,0')));
  d.trainings = [tr('a', 60, 58), tr('b', 55, 53), tr('c', 50, 50)];   // 2 punten: onder de drempel
  assert.notEqual(C.coachAdvice(d, P, NOW).rule, 'decline');
  d.trainings = [tr('a', 60, 57), tr('b', 55, 55), tr('c', 50, 50)];   // maar 1 van de 3
  assert.notEqual(C.coachAdvice(d, P, NOW).rule, 'decline');
});

test('elk advies heeft een titel, tekst en minstens één "Waarom?"-regel', () => {
  for (const d of [base(), { ...base(), drills: [bobs('b', day(0), [1])] }]) {
    const a = C.coachAdvice(d, P, NOW);
    assert.ok(a.title && a.text && a.why.length >= 1, a.rule);
  }
});

test('weekdoel: standaard 3 per week, week begint op maandag, aanpasbaar 1-7', () => {
  const d = base();
  assert.equal(C.weekGoal(d.settings), 3);
  assert.equal(C.weekGoal({ weekGoal: 5 }), 5);
  assert.equal(C.weekGoal({ weekGoal: 9 }), 3, 'ongeldig → standaard');
  d.drills.push(bobs('ma', new Date(2026, 10, 9, 0, 30).toISOString(), [1]));   // maandag 00:30
  d.drills.push(bobs('zo', new Date(2026, 10, 8, 23, 30).toISOString(), [1]));   // zondag ervoor: vorige week
  d.trainings.push(clock('k', day(0)));
  d.trainings.push({ ...clock('imp', day(0)), source: 'DartCounter' });   // import uit een andere app telt niet
  const w = C.weekProgress(d, P, NOW);
  assert.equal(w.count, 2); assert.equal(w.goal, 3); assert.equal(w.reached, false);
  assert.deepEqual(w.days, [true, false, false, true, false, false, false]);
  assert.equal(C.weekStart(NOW).getDay(), 1);
});

test('nieuwe records deze week: alleen als er van vóór deze week al een record was', () => {
  const d = base();
  d.drills.push(bobs('oud', day(-10), Array(21).fill(1)));
  d.drills.push(bobs('nieuw', day(0), Array(21).fill(2)));
  d.drills.push({ id: 'k', playerId: P, kind: 'clockD', startedAt: day(0), finishedAt: day(0), turns: D.clockTargets('clockD').map(x => ({ darts: [x] })) });
  const helpers = { drillRecords: D.drillRecords, trainingTotals, clockState };
  assert.deepEqual(C.newRecordsThisWeek(d, P, NOW, helpers), ["Bob's 27"], 'klok dubbels is nieuw, maar geen verbeterd record');
});
