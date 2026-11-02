// Regels van de gerichte oefeningen (1.10.0): Bob's 27, 121 Checkout, rond de klok dubbels/triples. Zie js/drills.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/drills.js';
import { x01Turn } from '../../js/logic.js';

const bobs = hits => hits.map((h, i) => ({ at: '2026-11-02T10:00:00.000Z', target: D.BOBS_TARGETS[i], hits: h }));

test("Bob's 27: start 27, raak telt de dubbel erbij, drie keer mis gaat hem eraf", () => {
  assert.equal(D.bobsState([]).score, 27);
  assert.equal(D.bobsState([]).target, 'D1');
  assert.equal(D.bobsState(bobs([0])).score, 25, 'D1 mis: 27 − 2');
  assert.equal(D.bobsState(bobs([1])).score, 29, 'D1 1×: 27 + 2');
  assert.equal(D.bobsState(bobs([0, 3])).score, 25 + 12, 'D2 3×: +12');
  assert.equal(D.bobsState(bobs([0, 0])).target, 'D3');
});

test("Bob's 27: de score zakt nooit onder 0 en je speelt alle 21 rondes uit", () => {
  const all = D.bobsState(bobs(Array(21).fill(0)));
  assert.equal(all.score, 0);
  assert.ok(all.rounds.every(r => r.score >= 0), 'na elke ronde minstens 0');
  assert.equal(all.done, true);
  assert.equal(all.darts, 63);
  // 27 − 2 − 4 − 6 − 8 = 7; D5 (−10) zou −3 geven → 0; daarna weer omhoog bij een treffer.
  const s = D.bobsState(bobs([0, 0, 0, 0, 0, 1]));
  assert.deepEqual(s.rounds.map(r => r.score), [25, 21, 15, 7, 0, 12]);
  assert.equal(s.rounds[4].delta, -7, 'werkelijke daling, niet −10');
});

test("Bob's 27: laatste ronde is de bull (50), maximale score 1437, niet verder dan 21 rondes", () => {
  assert.equal(D.BOBS_TARGETS.length, 21);
  assert.equal(D.BOBS_TARGETS[20], 'DB');
  assert.equal(D.doubleValue('DB'), 50);
  assert.equal(D.BOBS_MAX, 1437);
  assert.equal(D.bobsState(bobs(Array(21).fill(3))).score, 1437);
  assert.equal(D.bobsState([...bobs(Array(21).fill(1)), { hits: 3 }]).round, 21, 'een 22e ronde telt niet');
});

const t = (target, darts) => ({ at: '2026-11-02T10:00:00.000Z', target, darts });

test('121 Checkout: uitgegooid → doel + 1; niet gelukt in 3 beurten → terug naar het laatst gehaalde doel', () => {
  let st = D.c121State([t(121, ['T20', 'T11', 'D14'])]);
  assert.equal(st.target, 122); assert.equal(st.best, 121); assert.equal(st.safe, 121); assert.equal(st.round, 1);
  // 122 niet gelukt (3 beurten), terug naar 121
  const miss = [t(122, ['S1', 'S1', 'S1']), t(122, ['S1', 'S1', 'S1']), t(122, ['S1', 'S1', 'S1'])];
  st = D.c121State([t(121, ['T20', 'T11', 'D14']), ...miss]);
  assert.equal(st.target, 121); assert.equal(st.round, 2); assert.equal(st.best, 121);
  assert.deepEqual(st.log.map(x => x.ok), [true, false]);
});

test('121 Checkout: het veilige doel is in het begin 121, en schuift mee met elk gehaald doel', () => {
  const fail = target => [t(target, ['S1', 'S1', 'S1']), t(target, ['S1', 'S1', 'S1']), t(target, ['S1', 'S1', 'S1'])];
  assert.equal(D.c121State(fail(121)).target, 121, 'meteen mislukt: blijft 121');
  const turns = [t(121, ['T20', 'T11', 'D14']), t(122, ['T20', 'T14', 'D10']), ...fail(123)];
  const st = D.c121State(turns);
  assert.equal(st.target, 122, 'na 121 en 122 gehaald, 123 mislukt: terug naar 122');
  assert.equal(st.best, 122); assert.equal(st.successes, 2);
});

test('121 Checkout: bust beëindigt de beurt en zet de rest terug; uit over meerdere beurten telt', () => {
  let st = D.c121State([t(121, ['T20', 'T20', 'S1'])]);   // 121 → 1: bust bij dubbel uit
  assert.equal(st.remaining, 121); assert.equal(st.turnInRound, 1);
  st = D.c121State([t(121, ['T20', 'S1', 'S20']), t(121, ['D20'])]);   // 121 − 81 = 40, dan D20
  assert.equal(st.best, 121); assert.equal(st.target, 122); assert.equal(st.log[0].darts, 4);
  assert.equal(x01Turn(40, ['D20']).finished, true);
});

test('121 Checkout: een sessie heeft 10 doelen en is daarna klaar', () => {
  const turns = [];
  for (let i = 0; i < 10; i++) turns.push(t(121, ['S1', 'S1', 'S1']), t(121, ['S1', 'S1', 'S1']), t(121, ['S1', 'S1', 'S1']));
  const st = D.c121State(turns);
  assert.equal(st.done, true); assert.equal(st.round, 10); assert.equal(st.best, null);
  assert.equal(D.c121State([...turns, t(121, ['T20', 'T11', 'D14'])]).successes, 0, 'na doel 10 telt niets meer');
});

test('Rond de klok dubbels/triples: alleen precies het juiste vak telt; mikpunt per pijl wordt vastgelegd', () => {
  assert.equal(D.clockTargets('clockD').length, 21); assert.equal(D.clockTargets('clockD')[20], 'DB');
  assert.equal(D.clockTargets('clockT').length, 20); assert.equal(D.clockTargets('clockT')[19], 'T20');
  const st = D.clockVariantState('clockD', [{ darts: ['S1', 'T1', 'D1'] }, { darts: ['D2', 'S3', 'M'] }]);
  assert.equal(st.target, 'D3'); assert.equal(st.hits, 2); assert.equal(st.darts, 6);
  assert.deepEqual(D.clockAims('clockD', [], ['S1', 'D1', 'D2']), ['D1', 'D1', 'D2']);
  assert.deepEqual(D.clockAims('clockT', [{ darts: ['T1'] }], ['T3', 'T2', 'T3']), ['T2', 'T2', 'T3']);
  const done = D.clockVariantState('clockT', D.clockTargets('clockT').map(x => ({ darts: [x] })));
  assert.equal(done.done, true); assert.equal(done.darts, 20);
});

const P = 'p1';
const drill = (id, kind, startedAt, turns, finished = true) => ({ id, playerId: P, kind, startedAt, turns, ...(finished ? { finishedAt: startedAt } : {}) });

test("records: Bob's 27 alleen volledig gespeeld, 121 hoogste niveau, klok minste pijlen", () => {
  const ds = [
    drill('a', 'bobs27', '2026-11-02T10:00:00Z', bobs(Array(21).fill(1))),
    drill('b', 'bobs27', '2026-11-03T10:00:00Z', bobs(Array(10).fill(3))),   // gestopt: geen record
    drill('c', 'c121', '2026-11-03T11:00:00Z', [t(121, ['T20', 'T11', 'D14'])]),
    drill('d', 'clockT', '2026-11-03T12:00:00Z', D.clockTargets('clockT').map(x => ({ darts: [x] }))),
    drill('e', 'clockT', '2026-11-04T12:00:00Z', D.clockTargets('clockT').map(x => ({ darts: ['M', x] }))),
  ];
  const r = D.drillRecords(ds, P);
  assert.equal(r.bobs27.value, D.bobsState(bobs(Array(21).fill(1))).score);
  assert.equal(r.c121.value, 121);
  assert.equal(r.clockT.value, 20);
  assert.equal(D.drillRecords(ds, 'ander').bobs27, undefined);
});

test('trend per week: maandag t/m zondag; 121 = hoogste niveau, de rest = gemiddelde', () => {
  const ds = [
    drill('a', 'bobs27', '2026-11-02T10:00:00', bobs(Array(21).fill(1))),   // maandag week 45
    drill('b', 'bobs27', '2026-11-08T20:00:00', bobs(Array(21).fill(0))),   // zondag week 45
    drill('c', 'bobs27', '2026-11-09T10:00:00', bobs(Array(21).fill(0))),   // maandag week 46
    drill('d', 'c121', '2026-11-02T10:00:00', [t(121, ['T20', 'T11', 'D14'])]),
    drill('e', 'c121', '2026-11-04T10:00:00', [t(121, ['S1', 'S1', 'S1'])]),
  ];
  const w = D.weeklyTrend(ds, P, 'bobs27');
  assert.deepEqual(w.map(x => x.key), ['2026-W45', '2026-W46']);
  assert.equal(w[0].count, 2);
  assert.equal(w[0].value, Math.round(((D.bobsState(bobs(Array(21).fill(1))).score + 0) / 2) * 10) / 10);
  assert.deepEqual(D.weeklyTrend(ds, P, 'c121').map(x => x.value), [121]);
});

test('dubbels: alleen pijlen met een vast doel, nieuwste eerst, venster van 30 pijlen', () => {
  const ds = [];
  for (let i = 0; i < 12; i++) {
    const at = `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`;
    ds.push(drill('b' + i, 'bobs27', at, bobs(Array(21).fill(i < 2 ? 3 : 1)).map(x => ({ ...x, at }))));
  }
  ds.push(drill('k', 'clockD', '2026-10-25T10:00:00Z', [{ darts: ['S1', 'D1', 'M'], aims: ['D1', 'D1', 'D2'] }]));
  const rows = D.doubleStats(ds, P, 30);
  const d1 = rows.find(r => r.target === 'D1');
  assert.equal(d1.darts, 32, '2 klokpijlen + 9 rondes Bob = 29 < 30, dus nog één hele ronde erbij: 32');
  assert.equal(d1.hits, 1 + 10);
  assert.equal(d1.enough, true);
  const d2 = rows.find(r => r.target === 'D2');
  assert.equal(d2.enough, true);
  // De oudste twee Bob-rondes (3 raak) vallen buiten het venster.
  assert.equal(rows.find(r => r.target === 'D5').hits, 10);
});

test('validatie: onbekende soort, verkeerd doel of te veel treffers wordt afgekeurd', () => {
  const ids = new Set([P]);
  assert.equal(D.validDrill(drill('a', 'bobs27', '2026-11-02T10:00:00Z', bobs([1, 2])), ids), true);
  assert.equal(D.validDrill(drill('a', 'bobs27', '2026-11-02T10:00:00Z', [{ target: 'D2', hits: 1 }]), ids), false, 'verkeerd doel');
  assert.equal(D.validDrill(drill('a', 'bobs27', '2026-11-02T10:00:00Z', [{ target: 'D1', hits: 4 }]), ids), false, '4 treffers');
  assert.equal(D.validDrill(drill('a', 'cricket', '2026-11-02T10:00:00Z', []), ids), false);
  assert.equal(D.validDrill(drill('a', 'c121', '2026-11-02T10:00:00Z', [t(130, ['S1'])]), ids), false, 'doel past niet bij de beurten');
  assert.equal(D.validDrill(drill('a', 'c121', '2026-11-02T10:00:00Z', [t(121, ['T20', 'T11', 'D14']), t(122, ['S1'])]), ids), true);
  assert.equal(D.validDrill({ ...drill('a', 'clockD', '2026-11-02T10:00:00Z', [{ darts: ['Q9'] }]) }, ids), false);
  assert.equal(D.validDrill(drill('a', 'bobs27', '2026-11-02T10:00:00Z', []), new Set(['ander'])), false, 'onbekende speler');
});
