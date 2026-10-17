import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnTalk, startTalk, clockTalk, doneTalk, matchTalk, bustTalk, checkoutTalk } from '../../js/voice-lines.js';
import { turnScore } from '../../js/logic.js';

const r0 = () => 0;
// Beurt n in een training: scores = alle eerdere volledige beurten plus deze.
const turn = (darts, before = [], extra = {}) => turnTalk({ darts, scores: [...before, turnScore(darts)], n: before.length + 1, limit: null, ...extra }, r0);

test('grappige beurten: nul, bed and breakfast, drie keer één, drieling, bulls', () => {
  assert.match(turn(['M', 'M', 'M']), /Nul|mis|Oeps/);
  assert.match(turn(['S5', 'S20', 'S1']), /Bed and breakfast/);
  assert.equal(turn(['S20', 'D3', 'S1'], [], { limit: 30 }), null, 'andere 26: stil');
  assert.match(turn(['S1', 'S1', 'S1']), /Drie keer één/);
  assert.match(turn(['S19', 'S19', 'S19']), /hetzelfde vak|op een rij/);
  assert.match(turn(['DB', 'S5', 'S1']), /Bull/);
  assert.match(turn(['DB', 'DB', 'S1']), /cowboy/);
  assert.match(turn(['DB', 'DB', 'DB']), /rodeo/);
});

test('100+ en 140+: elke keer iets, met afwisseling', () => {
  assert.match(turn(['T20', 'S20', 'S20']), /Honderd plus|100|Ton/);
  assert.match(turn(['T20', 'T20', 'S20']), /Honderdveertig|140/);
  const all = new Set([0, 0.3, 0.6, 0.99].map(x => turnTalk({ darts: ['T20', 'S20', 'S20'], scores: [100], n: 1 }, () => x)));
  assert.ok(all.size >= 3, 'meerdere varianten');
});

test('gewone beurten zijn meestal stil; flow, koude reeks en comeback alleen op het juiste moment', () => {
  assert.equal(turn(['S20', 'S5', 'S5']), null);
  assert.match(turn(['S20', 'S20', 'S20'], [60]), /hetzelfde vak|op een rij/, 'S20×3 is een drieling');
});

test('flow na 3, 6, 9 goede beurten; koude reeks na 3 slechte; comeback na een slechte', () => {
  const good = ['T20', 'S20', 'S1'];   // 81
  assert.equal(turn(good, [81]), null);
  assert.match(turn(good, [81, 81]), /flow|zit erin|op rij/);
  assert.equal(turn(good, [81, 81, 81]), null);
  assert.match(turn(good, [81, 81, 81, 81, 81]), /flow|zit erin|op rij/);
  const bad = ['S5', 'S3', 'S1'];      // 9
  assert.equal(turn(bad, [9]), null);
  assert.match(turn(bad, [9, 9]), /Jij kan dit|Komt goed|beter/);
  assert.match(turn(good, [9]), /comeback|beter/);
});

test('voortgang: halverwege, nog één beurt, en bij vrij trainen elke 10 beurten', () => {
  const plain = ['S20', 'S5', 'S5'];
  const at = (n, limit, darts = plain, progress = true) => turnTalk({ darts, scores: Array(n).fill(30), n, limit, progress }, r0);
  assert.match(at(5, 10), /Halverwege|helft/);
  assert.match(at(9, 10), /Nog één beurt|Laatste beurt/);
  assert.equal(at(10, 10), null, 'laatste beurt zelf: de afsluiting praat');
  assert.equal(at(4, 10), null);
  assert.equal(at(9, 10, plain, false), null, 'samen trainen: alleen de eerste speler hoort de voortgang');
  assert.match(at(20, null), /20 beurten/);
  assert.equal(at(19, null), null);
  assert.match(at(9, 10, ['T20', 'S20', 'S20']), /^.+! Nog één beurt!$/, 'combinatie: 100+ en voortgang in één zin');
});

test('start, rond de klok en afsluiting', () => {
  assert.match(startTalk('score', r0), /!/);
  assert.match(startTalk('clock', r0), /klok/);
  assert.match(startTalk('match', r0), /Game on/);
  assert.match(clockTalk(19, 20, 1, r0), /bull/);
  assert.match(clockTalk(8, 10, 2, r0), /klok/);
  assert.match(clockTalk(3, 6, 3, r0), /Drie/);
  assert.equal(clockTalk(3, 4, 1, r0), null);
  assert.equal(clockTalk(20, 21, 1, r0), null, 'klaar: dat zegt de afsluiting');
  assert.equal(doneTalk({ kind: 'score', avg: 45.26, prevAvg: 40 }, r0), 'Klaar! Gemiddeld 45,3. Beter dan vorige keer!');
  assert.match(doneTalk({ kind: 'score', avg: 30, prevAvg: 40 }, r0), /^Klaar! Gemiddeld 30\. (Lekker|Goed|Mooi)/);
  assert.match(doneTalk({ kind: 'clock', darts: 47 }, r0), /47 pijlen/);
  assert.match(doneTalk({ group: true }, r0), /allemaal|samen/);
});

test('wedstrijd: finish-calls, gekkenhuis, big fish, bust en uitgooien', () => {
  const plain = ['S20', 'S5', 'S5'];
  assert.equal(matchTalk({ darts: plain, score: 30, next: 32 }, r0), 'Nog 32. Dubbel 16!');
  assert.equal(matchTalk({ darts: plain, score: 30, next: 33 }, r0), null);
  assert.equal(matchTalk({ darts: plain, score: 30, next: 32, doubleOut: false }, r0), null);
  assert.match(matchTalk({ darts: plain, score: 30, next: 2 }, r0), /gekkenhuis/);
  assert.match(matchTalk({ darts: plain, score: 30, next: 170 }, r0), /big fish/);
  assert.match(matchTalk({ darts: plain, score: 30, next: 50 }, r0), /bull/);
  assert.equal(matchTalk({ darts: plain, score: 30, next: 301 }, r0), null);
  assert.match(matchTalk({ darts: ['T20', 'S20', 'S20'], score: 100, next: 40 }, r0), /^.+! Nog 40\. Dubbel 20!$/);
  assert.match(bustTalk(r0), /Bust|overgegooid/);
  assert.match(checkoutTalk(2, 'D1', r0), /gekkenhuis/);
  assert.match(checkoutTalk(40, 'D20', r0), /uit|Uitgegooid/i);
});

test('alle zinnen kindvriendelijk kort en zonder namen', () => {
  const lines = [];
  for (const x of [0, 0.34, 0.67, 0.99]) {
    const r = () => x;
    lines.push(turnTalk({ darts: ['M', 'M', 'M'], scores: [0], n: 1 }, r), turnTalk({ darts: ['T20', 'T20', 'S20'], scores: [140], n: 1 }, r),
      startTalk('score', r), startTalk('clock', r), startTalk('match', r), bustTalk(r), checkoutTalk(40, 'D20', r), doneTalk({ kind: 'score', avg: 40, prevAvg: 50 }, r));
  }
  for (const l of lines) { assert.ok(l && l.length <= 80, l); assert.doesNotMatch(l, /\$\{|undefined|NaN/); }
});
