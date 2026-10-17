// Persoonlijk doel en gesproken aanmoedigingen: alleen bij echte, eigen prestaties; geen onterechte felicitaties.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalFor, improvedClearly, comparable, highestTurn } from '../../js/motivation.js';
import { turnLine, trainingLine, checkoutLine, pickVoice, CHEER } from '../../js/speech.js';

// Training van 30 pijlen met een vast gemiddelde (10 beurten, elke beurt `per3` punten via enkele vakken).
let n = 0;
function training(per3, { player = 'p1', limitTurns = 10, turns = 10, day = n } = {}) {
  n++;
  const a = Math.min(20, per3), b = Math.min(20, per3 - a), c = per3 - a - b;
  const darts = [a, b, c].map(x => (x ? 'S' + x : 'M'));
  const at = new Date(Date.UTC(2026, 0, 1 + day)).toISOString();
  return { id: 't' + n, playerId: player, kind: 'score', limitTurns, startedAt: at, finishedAt: at, turns: Array.from({ length: turns }, () => ({ at, darts })) };
}

test('doel pas na 3 vergelijkbare trainingen; iets boven het recente niveau, nooit boven het record', () => {
  const ts = [training(40), training(42)];
  assert.equal(goalFor(ts, 'p1', 10), null, 'te weinig geschiedenis');
  ts.push(training(44));
  const g = goalFor(ts, 'p1', 10);
  assert.equal(g.recent, 42);
  assert.equal(g.best, 44);
  assert.ok(g.target > g.recent && g.target <= g.best + 0.1, JSON.stringify(g));
  assert.equal(goalFor(ts, 'p1', 20), null, 'andere lengte telt niet mee');
  assert.equal(goalFor(ts, 'p2', 10), null, 'andere speler telt niet mee');
});

test('dicht bij je record wordt het doel: je record verbeteren', () => {
  const g = goalFor([training(50), training(50), training(51)], 'p1', 10);
  assert.equal(g.record, true);
  assert.equal(g.target, 51.1);
});

test('onvolledige trainingen en trainingen zonder datum tellen niet mee', () => {
  const ts = [training(40), training(40), training(40, { turns: 4 }), { ...training(60), dateUnknown: true }];
  assert.equal(comparable(ts, 'p1', 10).length, 2);
});

test('duidelijke verbetering: minstens 10% en 3 punten boven de laatste 5', () => {
  const before = comparable([training(40), training(40), training(40)], 'p1', 10);
  assert.equal(improvedClearly(43.9, before), false);
  assert.equal(improvedClearly(44, before), true);
  assert.equal(improvedClearly(80, before.slice(0, 2)), false, 'te weinig geschiedenis: niets zeggen');
});

test('beurt: 180-call altijd; eerste 100+/140+/180 alleen de eerste keer; gewone beurten stil', () => {
  assert.deepEqual(turnLine(180, 140), { call180: true, text: 'Ja! Je eerste honderdtachtig! Ongelooflijk!' });
  assert.equal(turnLine(180, 180).call180, true);
  assert.match(turnLine(180, 180, () => 0).text, /!$/, 'herhaalde 180: korte juich na de call');
  assert.match(turnLine(100, 60).text, /^(Yes|Daar is ie)! Je eerste honderd plus! .+!$/);
  assert.match(turnLine(140, 120).text, /^(Wauw|Boem)! Je eerste honderdveertig plus! .+!$/);
  assert.match(turnLine(121, 120).text, /121!/);
  assert.equal(turnLine(100, 120), null);
  assert.equal(turnLine(85, 40), null);
});

test('stem: enthousiast (sneller en hoger), afwisselend, en elke zin eindigt met een uitroepteken', () => {
  assert.ok(CHEER.rate > 1 && CHEER.rate <= 1.2 && CHEER.pitch > 1 && CHEER.pitch <= 1.3);
  const first = turnLine(100, 60, () => 0).text, last = turnLine(100, 60, () => 0.999).text;
  assert.notEqual(first, last, 'twee varianten');
  const lines = [turnLine(140, 60, () => 0.5), turnLine(150, 145, () => 0.5), trainingLine({ goalReached: true }, () => 0.9), trainingLine({ improved: true }, () => 0.1),
    trainingLine({ records: [{ label: 'Beste 30 pijlen', spoken: '54,2 gemiddeld' }] }, () => 0.5), checkoutLine(121, 'D8', () => 0.7), checkoutLine(50, 'DB', () => 0.2)];
  for (const l of lines) assert.match(l.text, /!$/, l.text);
});

test('na de training: record gaat voor, dan doel, dan verbetering; anders stil', () => {
  assert.match(trainingLine({ records: [{ label: 'Beste 30 pijlen', spoken: '54,2 gemiddeld' }], improved: true }).text, /record! Beste 30 pijlen: 54,2/);
  assert.match(trainingLine({ goalReached: true, improved: true }).text, /Doel gehaald/);
  assert.equal(trainingLine({ improved: true }).improvement, true);
  assert.equal(trainingLine({}), null);
  assert.equal(checkoutLine(40, 'D20'), null);
  assert.match(checkoutLine(121, 'D8').text, /121 uit/);
  assert.match(checkoutLine(50, 'DB').text, /bull/i);
});

test('hoogste beurt ooit telt trainingen en wedstrijden; stem: Nederlands, liefst verbeterd en op het toestel', () => {
  const data = { trainings: [training(60)], matches: [{ players: [{ id: 'p1', name: 'A' }], settings: { start: 501, bestOf: 1, doubleOut: true }, legs: [{ starter: 0, turns: [{ p: 0, darts: ['T20', 'T20', 'S20'] }] }] }] };
  assert.equal(highestTurn(data, 'p1'), 140);
  const voices = [{ name: 'Google Nederlands', lang: 'nl-NL', localService: false }, { name: 'Xander (Enhanced)', lang: 'nl-NL', localService: true }, { name: 'Daniel', lang: 'en-GB', localService: true }];
  assert.equal(pickVoice(voices, 'nl-NL').name, 'Xander (Enhanced)');
  assert.equal(pickVoice(voices, 'en-GB').name, 'Daniel');
  assert.equal(pickVoice([{ name: 'Ellen', lang: 'nl_BE', localService: true }], 'nl-NL').name, 'Ellen', 'Vlaams als er geen Nederlandse stem is');
  assert.equal(pickVoice([], 'nl-NL'), null);
});
