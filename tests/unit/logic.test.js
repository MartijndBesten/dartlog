import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../js/logic.js';

test('pijlen: enkel, dubbel, triple, bull, mis', () => {
  assert.equal(L.points('S20'), 20);
  assert.equal(L.points('D20'), 40);
  assert.equal(L.points('T20'), 60);
  assert.equal(L.points('T19'), 57);
  assert.equal(L.points('SB'), 25);
  assert.equal(L.points('DB'), 50);
  assert.equal(L.points('M'), 0);
  assert.equal(L.dart('DB').isDouble, true);
  assert.equal(L.dart('SB').isDouble, false);
  assert.equal(L.dart('D5').isDouble, true);
  assert.equal(L.dart('X60').known, false);
});

test('ongeldige pijlen worden geweigerd', () => {
  for (const bad of ['T21', 'D0', 'S0', 'T25', 'Q5', '', 'X61', 'TT20', null, undefined]) {
    assert.equal(L.isValidCode(bad), false, String(bad));
  }
});

test('tekstinvoer', () => {
  assert.deepEqual(L.parseInput('t20'), { code: 'T20' });
  assert.deepEqual(L.parseInput(' D16 '), { code: 'D16' });
  assert.deepEqual(L.parseInput('5'), { code: 'S5' });
  assert.deepEqual(L.parseInput('s5'), { code: 'S5' });
  assert.deepEqual(L.parseInput('0'), { code: 'M' });
  assert.deepEqual(L.parseInput('mis'), { code: 'M' });
  assert.deepEqual(L.parseInput('25'), { code: 'SB' });
  assert.deepEqual(L.parseInput('bull'), { code: 'DB' });
  assert.deepEqual(L.parseInput('50'), { code: 'DB' });
  assert.ok(L.parseInput('T21').error);
  assert.ok(L.parseInput('21').error);
  assert.ok(L.parseInput('abc').error);
  assert.deepEqual(L.parseLine('T20 5 D10'), { codes: ['T20', 'S5', 'D10'] });
  assert.ok(L.parseLine('T20 x').error);
});

test('voorbeeld uit de opdracht: T20 + 5 + D10 = 85', () => {
  assert.equal(L.turnScore(['T20', 'S5', 'D10']), 85);
  assert.equal(L.turnScore(['T20', 'T20', 'T20']), 180);
});

test('gemiddelde per 3 pijlen: 800 punten uit 30 pijlen = 80,00', () => {
  assert.equal(L.avg3(800, 30), 80);
  assert.equal(L.avg3(0, 0), 0);
});

function training(turnCodes, limitTurns = null) {
  return { id: 't', kind: 'score', limitTurns, startedAt: '2026-10-01T10:00:00.000Z', turns: turnCodes.map(d => ({ darts: d })) };
}

test('scoretraining-totalen, hoogste/laagste, 100+/140+/180', () => {
  const t = training([['T20', 'T20', 'T20'], ['S1', 'S1', 'M'], ['T20', 'T20', 'S20'], ['T20', 'S20', 'S20']]);
  const tot = L.trainingTotals(t);
  assert.equal(tot.points, 180 + 2 + 140 + 100);
  assert.equal(tot.darts, 12);
  assert.equal(tot.high, 180);
  assert.equal(tot.low, 2);
  assert.equal(tot.tons, 3);
  assert.equal(tot.t140, 2);
  assert.equal(tot.t180, 1);
  assert.equal(L.round2(tot.avg), L.round2((422 / 12) * 3));
});

test('exact 30, 60 en 99 pijlen ronden de training af', () => {
  for (const turns of [10, 20, 33]) {
    const t = training(Array.from({ length: turns - 1 }, () => ['S20', 'S20', 'S20']), turns);
    assert.equal(L.trainingIsComplete(t), false);
    t.turns.push({ darts: ['S20', 'S20', 'S20'] });
    assert.equal(L.trainingIsComplete(t), true);
    assert.equal(L.trainingTotals(t).darts, turns * 3);
    assert.equal(L.trainingTotals(t).avg, 60);
  }
  assert.equal(L.trainingIsComplete(training([['S1', 'S1', 'S1']], null)), false);
});

test('X01: normale beurt', () => {
  assert.deepEqual(L.x01Turn(501, ['T20', 'T20', 'T20']), { bust: false, finished: false, scored: 180, remaining: 321, dartsUsed: 3 });
});

test('X01: double-out uitgooien met 1, 2 of 3 pijlen', () => {
  assert.equal(L.x01Turn(40, ['D20']).finished, true);
  assert.equal(L.x01Turn(40, ['D20']).dartsUsed, 1);
  assert.equal(L.x01Turn(100, ['T20', 'D20']).finished, true);
  assert.equal(L.x01Turn(100, ['T20', 'D20']).dartsUsed, 2);
  assert.equal(L.x01Turn(170, ['T20', 'T20', 'DB']).finished, true);
  assert.equal(L.x01Turn(50, ['DB']).finished, true, 'bull telt als dubbel');
});

test('X01: bust-regels', () => {
  assert.equal(L.x01Turn(40, ['S20', 'S20']).bust, true, 'op 0 zonder dubbel');
  assert.equal(L.x01Turn(32, ['T20']).bust, true, 'onder nul');
  assert.equal(L.x01Turn(21, ['S20']).bust, true, 'rest 1 bij double-out');
  assert.equal(L.x01Turn(25, ['SB']).bust, true, 'single bull is geen dubbel');
  const b = L.x01Turn(60, ['S20', 'T20']);
  assert.equal(b.bust, true);
  assert.equal(b.remaining, 60, 'stand blijft gelijk na bust');
  assert.equal(b.scored, 0);
  assert.equal(b.dartsUsed, 2);
});

test('X01: straight-out', () => {
  assert.equal(L.x01Turn(40, ['S20', 'S20'], false).finished, true);
  assert.equal(L.x01Turn(21, ['S20'], false).bust, false);
  assert.equal(L.x01Turn(21, ['S20'], false).remaining, 1);
  assert.equal(L.x01Turn(10, ['S20'], false).bust, true);
});

test('leg- en wedstrijdverloop 501 met twee spelers', () => {
  const m = { players: [{ name: 'A' }, { name: 'B' }], settings: { start: 501, bestOf: 3, doubleOut: true }, legs: [{ starter: 0, turns: [] }] };
  const nine = [['T20', 'T20', 'T20'], ['T20', 'T20', 'T20'], ['T20', 'T19', 'D12']];
  const leg = m.legs[0];
  leg.turns.push({ p: 0, darts: nine[0] }, { p: 1, darts: ['S1', 'S1', 'S1'] }, { p: 0, darts: nine[1] }, { p: 1, darts: ['S1', 'S1', 'S1'] }, { p: 0, darts: nine[2] });
  const ls = L.legState(leg, 501, 2, true);
  assert.equal(ls.winner, 0);
  assert.equal(ls.remaining[0], 0);
  assert.equal(ls.remaining[1], 495);
  let st = L.matchState(m);
  assert.deepEqual(st.won, [1, 0]);
  assert.equal(st.winner, null);
  assert.equal(L.round2(st.totals[0].avg), 167);
  assert.equal(st.totals[0].bestCheckout, 141);
  assert.equal(st.totals[0].t180, 2);
  // tweede leg: B begint en wint
  m.legs.push({ starter: 1, turns: [] });
  assert.equal(L.legState(m.legs[1], 501, 2).toThrow, 1);
  m.legs[1].turns.push({ p: 1, darts: nine[0] }, { p: 0, darts: ['M', 'M', 'M'] }, { p: 1, darts: nine[1] }, { p: 0, darts: ['M'] }, { p: 1, darts: nine[2] });
  st = L.matchState(m);
  assert.deepEqual(st.won, [1, 1]);
  assert.equal(st.winner, null);
  m.legs.push({ starter: 0, turns: [{ p: 0, darts: nine[0] }, { p: 1, darts: ['M', 'M', 'M'] }, { p: 0, darts: nine[1] }, { p: 1, darts: ['M', 'M', 'M'] }, { p: 0, darts: nine[2] }] });
  st = L.matchState(m);
  assert.equal(st.winner, 0);
  assert.equal(st.need, 2);
});

test('bust telt pijlen mee in het gemiddelde maar geen punten', () => {
  const m = { players: [{ name: 'A' }], settings: { start: 301, bestOf: 1, doubleOut: true }, legs: [{ starter: 0, turns: [] }] };
  m.legs[0].turns.push({ p: 0, darts: ['T20', 'T20', 'T20'] }, { p: 0, darts: ['T20', 'T20', 'T20'] }, { p: 0, darts: ['S20', 'S20'] }); // 121 → bust? nee: 301-360 → tweede beurt bust
  const ls = L.legState(m.legs[0], 301, 1, true);
  assert.equal(ls.remaining[0], 121 - 40);
  assert.equal(ls.stats[0].darts, 8);
  assert.equal(ls.stats[0].points, 180 + 40);
});

test('legsToWin', () => {
  assert.equal(L.legsToWin(1), 1);
  assert.equal(L.legsToWin(3), 2);
  assert.equal(L.legsToWin(5), 3);
  assert.equal(L.legsToWin(9), 5);
});

test('uitgooi-advies', () => {
  assert.deepEqual(L.checkout(170), ['T20', 'T20', 'DB']);
  assert.deepEqual(L.checkout(40), ['D20']);
  assert.deepEqual(L.checkout(100), ['T20', 'D20']);
  assert.deepEqual(L.checkout(32), ['D16']);
  assert.equal(L.checkout(169), null);
  assert.equal(L.checkout(159), null);
  assert.equal(L.checkout(1), null);
  assert.equal(L.checkout(171), null);
  assert.equal(L.checkout(100, 1), null);
  assert.equal(L.checkout(61, 1), null);
  // elke route moet echt uitkomen en eindigen op een dubbel
  for (let r = 2; r <= 170; r++) {
    for (const d of [1, 2, 3]) {
      const route = L.checkout(r, d);
      if (!route) continue;
      assert.ok(route.length <= d);
      assert.equal(L.turnScore(route), r);
      assert.equal(L.dart(route[route.length - 1]).isDouble, true);
      assert.equal(L.x01Turn(r, route).finished, true, `route voor ${r}`);
    }
  }
  // straight out
  assert.deepEqual(L.checkout(20, 1, false), ['S20']);
});

test('rond de klok', () => {
  const t = { turns: [{ darts: ['S1', 'M', 'D2'] }, { darts: ['T3', 'S5', 'S4'] }] };
  const st = L.clockState(t);
  assert.equal(st.targetIndex, 4);
  assert.equal(st.target, 5);
  assert.equal(st.darts, 6);
  assert.equal(st.hits, 4);
  const all = { turns: [{ darts: [...Array.from({ length: 20 }, (_, i) => 'S' + (i + 1)), 'DB'] }] };
  assert.equal(L.clockState(all).done, true);
  assert.equal(L.clockState(all).darts, 21);
});

test('trefferverdeling', () => {
  const d = L.hitDistribution([{ darts: ['T20', 'S20', 'D16', 'M', 'DB', 'SB', 'X45'] }]);
  assert.deepEqual(d.bySeg['20'], { S: 1, D: 0, T: 1 });
  assert.deepEqual(d.bySeg['25'], { S: 1, D: 1, T: 0 });
  assert.equal(d.mult.M, 1);
  assert.equal(d.mult.B, 2);
  assert.equal(d.total, 6, 'onbekend vak telt niet mee');
});

test('meest geraakt volgt het filter: alles, enkel, dubbel, triple', () => {
  const d = L.hitDistribution([
    { darts: ['T20', 'T20', 'S20'] }, { darts: ['S5', 'S5', 'S5'] }, { darts: ['T19', 'D16', 'D16'] },
    { darts: ['SB', 'DB', 'DB'] }, { darts: ['S1', 'M', 'D20'] },
  ]);
  assert.deepEqual(L.topHits(d, 'all'), [['20', 4], ['5', 3], ['Bull', 3], ['16', 2], ['1', 1], ['19', 1]]);
  assert.deepEqual(L.topHits(d, 'S'), [['5', 3], ['1', 1], ['20', 1], ['25', 1]]);
  assert.deepEqual(L.topHits(d, 'D'), [['D16', 2], ['Bull', 2], ['D20', 1]], 'gelijk aantal: laagste getal eerst, bull achteraan');
  assert.deepEqual(L.topHits(d, 'T'), [['T20', 2], ['T19', 1]]);
  assert.deepEqual(L.topHits(L.hitDistribution([{ darts: ['S1', 'S2', 'S3'] }]), 'T'), [], 'geen triples: lege lijst');
  assert.equal(L.topHits(d, 'all', 2).length, 2, 'maximaal het gevraagde aantal');
});

test('gewogen gemiddelde per periode (niet het gemiddelde van gemiddelden)', () => {
  const a = { id: 'a', startedAt: '2026-10-01T10:00:00Z', turns: [{ darts: ['T20', 'T20', 'T20'] }] }; // 180 in 3
  const b = { id: 'b', startedAt: '2026-10-01T18:00:00Z', turns: Array.from({ length: 9 }, () => ({ darts: ['M', 'M', 'M'] })) }; // 0 in 27
  const g = L.groupAverages([a, b], 'dag');
  assert.equal(g.length, 1);
  assert.equal(g[0].avg, 18); // 180 / 30 * 3, niet (180+0)/2 = 90
  assert.equal(L.groupAverages([a, b], 'training').length, 2);
});

test('periodes en reeksen', () => {
  assert.equal(L.periodKey(new Date(2026, 0, 1), 'week'), '2026-W01');
  assert.equal(L.periodKey(new Date(2026, 9, 10), 'maand'), '2026-10');
  const today = new Date(2026, 9, 10, 12);
  const d = n => new Date(2026, 9, 10 - n, 12).toISOString();
  assert.equal(L.dayStreak([d(0), d(1), d(2), d(4)], today), 3);
  assert.equal(L.dayStreak([d(1), d(2)], today), 2, 'vandaag nog niet gegooid telt reeks tot gisteren');
  assert.equal(L.dayStreak([d(3)], today), 0);
  assert.equal(L.longestStreak([d(0), d(1), d(2), d(5), d(6), d(7), d(8)]), 4);
});

test('beurten per training: volgorde, pijlen, onvolledige laatste beurt en import zonder pijlen', () => {
  const t = { turns: [{ darts: ['T20', 'S20', 'S20'] }, { darts: ['S5', 'M', 'S1'] }, { darts: ['T20', 'T20'] }] };
  const s = L.turnSeries(t);
  assert.deepEqual(s.map(x => [x.n, x.score, x.complete]), [[1, 100, true], [2, 6, true], [3, 120, false]]);
  assert.deepEqual(s[0].darts, ['T20', 'S20', 'S20']);
  s[0].darts.push('X');
  assert.equal(t.turns[0].darts.length, 3, 'de training zelf verandert niet');
  assert.deepEqual(L.turnSeries({ summary: { points: 600, darts: 30, high: 140 }, turns: [] }), [], 'eindstand uit een andere app: geen verzonnen beurten');
  assert.deepEqual(L.turnSeries({}), []);
});

test('hoogste en laagste beurt: alleen volledige beurten, gedeelde plekken allemaal', () => {
  const series = L.turnSeries({ turns: [
    { darts: ['T20', 'T20', 'S20'] }, { darts: ['S1', 'S1', 'S1'] }, { darts: ['T20', 'T19', 'S20'] },
    { darts: ['T20', 'T20', 'S20'] }, { darts: ['S1', 'S1', 'S1'] }, { darts: ['T20', 'T20'] },
  ] });
  assert.deepEqual(L.extremeTurns(series, 'high'), { score: 140, turns: [1, 4] }, 'onvolledige 120 telt niet; gelijke 140 beide');
  assert.deepEqual(L.extremeTurns(series, 'low'), { score: 3, turns: [2, 5] });
  assert.equal(L.extremeTurns(L.turnSeries({ turns: [{ darts: ['T20', 'T20'] }] })), null, 'geen volledige beurt: geen hoogste beurt');
  assert.equal(L.extremeTurns([]), null);
});

test('hoogste en laagste beurt kloppen met trainingTotals, ook bij afwijkende lengtes', () => {
  const codes = ['T20', 'S20', 'S1', 'D16', 'M', 'T19', 'SB', 'DB', 'S5', 'T5'];
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const turnsCount of [1, 7, 10, 20, 33, 61]) {
    const turns = Array.from({ length: turnsCount }, (_, i) => ({ darts: Array.from({ length: i === turnsCount - 1 && turnsCount % 2 ? 2 : 3 }, () => codes[Math.floor(rnd() * codes.length)]) }));
    const tot = L.trainingTotals({ turns }), series = L.turnSeries({ turns });
    assert.equal(series.length, turnsCount);
    assert.equal(series.reduce((a, s) => a + s.score, 0), tot.points);
    assert.equal(L.extremeTurns(series, 'high')?.score ?? null, tot.high, 'hoogste bij ' + turnsCount);
    assert.equal(L.extremeTurns(series, 'low')?.score ?? null, tot.low, 'laagste bij ' + turnsCount);
  }
});
