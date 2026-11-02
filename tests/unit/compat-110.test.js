// 1.10.0 en oudere versies: back-ups en overzetcodes blijven in beide richtingen werken, zonder verlies.
// tests/fixtures/v1.9.0/ bevat store.js, logic.js en transfer.js precies zoals in 1.9.0 (live op 1 november 2026, fe86a8b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../js/store.js';
import * as T from '../../js/transfer.js';
import * as L from '../../js/logic.js';
import * as OldS from '../fixtures/v1.9.0/store.js';
import * as OldT from '../fixtures/v1.9.0/transfer.js';

// Een volledige 1.9.0-gegevensset, gemaakt met de 1.9.0-code: score, klok, groep, import, wedstrijd, lopende training.
function data190() {
  const d = OldS.emptyData();
  const a = OldS.newPlayer('Sem', 0), b = OldS.newPlayer('Papa', 1);
  d.players.push(a, b); d.activePlayerId = a.id;
  d.trainings.push(
    { id: 't1', playerId: a.id, kind: 'score', limitTurns: 10, startedAt: '2026-10-01T10:00:00.000Z', finishedAt: '2026-10-01T10:20:00.000Z', turns: Array.from({ length: 10 }, (_, i) => ({ at: '2026-10-01T10:0' + (i % 10) + ':00.000Z', darts: ['T20', 'S5', i % 2 ? 'D10' : 'M'] })) },
    { id: 't2', playerId: a.id, kind: 'clock', limitTurns: null, startedAt: '2026-10-02T10:00:00.000Z', finishedAt: '2026-10-02T10:10:00.000Z', turns: [{ at: '2026-10-02T10:01:00.000Z', darts: ['S1', 'D2', 'T3'] }] },
    { id: 't3', playerId: b.id, kind: 'score', limitTurns: 20, startedAt: '2026-10-03T10:00:00.000Z', finishedAt: '2026-10-03T10:30:00.000Z', groupId: 'g', groupPlayers: [a.id, b.id], turns: [{ at: '2026-10-03T10:01:00.000Z', darts: ['S20', 'S1', 'S5'] }] },
    OldS.summaryTraining({ playerId: a.id, points: 1200, darts: 30, high: 140, source: 'DartCounter', id: 'imp1' }),
  );
  d.matches.push({ id: 'm1', startedAt: '2026-10-04T10:00:00.000Z', finishedAt: '2026-10-04T10:30:00.000Z', settings: { start: 301, bestOf: 1, doubleOut: true }, players: [{ id: a.id, name: 'Sem' }, { id: null, name: 'Gast' }], legs: [{ starter: 0, turns: [{ p: 0, darts: ['T20', 'T20', 'T20'] }, { p: 1, darts: ['S1', 'S1', 'S1'] }, { p: 0, darts: ['T20', 'T20', 'T19'] }, { p: 1, darts: ['M'] }, { p: 0, darts: ['D2'] }] }] });
  d.active.training = { id: 'act', playerId: a.id, players: [a.id], kind: 'score', limitTurns: null, startedAt: '2026-10-05T10:00:00.000Z', turns: [], pending: ['T20'] };
  d.settings.statView = { [a.id]: { many: ['avg', 'trend'] } };
  return JSON.parse(JSON.stringify(d));   // zoals in localStorage of een back-upbestand
}

test('back-up van 1.9.0 terugzetten in 1.10.0: alles komt terug, niets verandert', () => {
  const old = data190();
  const file = OldS.makeBackup(old, { appVersion: '1.9.0' });
  const r = S.parseBackup(file);
  assert.equal(r.error, undefined);
  for (const k of ['players', 'trainings', 'matches', 'activePlayerId', 'settings']) assert.deepEqual(r.data[k], old[k], k);
  assert.deepEqual(r.data.active, old.active);
  assert.equal(r.data.drills, undefined, 'geen lege oefeningenlijst bijgevoegd: het formaat blijft gelijk');
  // Opnieuw bewaren in 1.10.0 en terugzetten: identiek.
  assert.deepEqual(S.parseBackup(S.makeBackup(r.data, { appVersion: '1.10.0' })).data, r.data);
  // Opslaan en laden via de opslag (localStorage-sleutel oche.data).
  const m = new Map(); const st = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
  st.setItem(S.STORAGE_KEY, JSON.stringify(old));
  assert.deepEqual(S.createStore(st).load().data, r.data);
});

function with110(d) {
  const p = d.players[0].id;
  d.drills = [
    { id: 'dr1', playerId: p, kind: 'bobs27', startedAt: '2026-11-02T10:00:00.000Z', finishedAt: '2026-11-02T10:10:00.000Z', turns: [{ at: '2026-11-02T10:01:00.000Z', target: 'D1', hits: 2 }] },
    { id: 'dr2', playerId: p, kind: 'c121', startedAt: '2026-11-02T11:00:00.000Z', finishedAt: '2026-11-02T11:10:00.000Z', turns: [{ at: '2026-11-02T11:01:00.000Z', target: 121, darts: ['T20', 'T11', 'D14'] }] },
    { id: 'dr3', playerId: p, kind: 'clockD', startedAt: '2026-11-02T12:00:00.000Z', finishedAt: '2026-11-02T12:10:00.000Z', turns: [{ at: '2026-11-02T12:01:00.000Z', darts: ['S1', 'D1', 'D2'], aims: ['D1', 'D1', 'D2'] }] },
  ];
  d.active.drill = { id: 'act-d', playerId: p, kind: 'bobs27', startedAt: '2026-11-03T10:00:00.000Z', turns: [{ target: 'D1', hits: 1 }], pending: [] };
  d.settings.weekGoal = 4;
  // Wedstrijd met beurttotaal (X-pijlen en total: true).
  d.matches.push({ id: 'm2', startedAt: '2026-11-02T13:00:00.000Z', settings: { start: 301, bestOf: 1, doubleOut: true, entry: 'total' }, players: [{ id: p, name: 'Sem' }],
    legs: [{ starter: 0, turns: [{ p: 0, darts: L.totalToDarts(140, 301), total: true }, { p: 0, darts: L.totalToDarts(121, 161), total: true }, { p: 0, darts: L.totalToDarts(40, 40, { finishDarts: 1 }), total: true }] }] });
  return d;
}

test('back-up van 1.10.0 (met oefeningen en beurttotaal) terugzetten in 1.10.0: zonder verlies', () => {
  const d = with110(data190());
  const r = S.parseBackup(S.makeBackup(d));
  assert.equal(r.error, undefined);
  assert.deepEqual(r.data.drills, d.drills);
  assert.deepEqual(r.data.active.drill, d.active.drill);
  assert.equal(r.data.settings.weekGoal, 4);
  assert.equal(L.matchState(r.data.matches[1]).winner, 0, 'wedstrijd met beurttotaal is uitgegooid');
});

test('back-up van 1.10.0 in de oude 1.9.0-app: wordt niet afgekeurd en de oefeningen blijven bewaard', () => {
  const d = with110(data190());
  const r = OldS.parseBackup(S.makeBackup(d));
  assert.equal(r.error, undefined, 'oude validatie keurt niets af');
  assert.deepEqual(r.data.drills, d.drills, 'onbekend veld blijft staan');
  assert.deepEqual(r.data.trainings, d.trainings);
  // De oude app rekent de beurttotaal-wedstrijd goed uit: stand en gemiddelde kloppen.
  assert.equal(L.matchState(r.data.matches[1]).totals[0].points, 301);
  // En terug naar 1.10.0: nog steeds alles.
  assert.deepEqual(S.parseBackup(OldS.makeBackup(r.data)).data.drills, d.drills);
});

test('overzetcode: 1.10.0 → 1.9.0 heeft dezelfde vingerafdruk, en de oefeningen hebben een eigen controle', async () => {
  const d = with110(data190());
  const pkg = await T.makePackage(d, {});
  assert.equal(pkg.fingerprint, await OldT.fingerprint(d), 'oude app accepteert de code');
  const opened = await OldT.openPackage(JSON.parse(JSON.stringify(pkg)));
  assert.equal(opened.error, undefined);
  assert.deepEqual(opened.data.drills, d.drills);
  // Oefeningen onderweg veranderd → 1.10.0 weigert.
  const bad = JSON.parse(JSON.stringify(pkg)); bad.data.drills[0].turns[0].hits = 3;
  assert.match((await T.openPackage(bad)).error, /onderweg veranderd/);
  // Code uit 1.9.0 (zonder drillsFingerprint) gaat in 1.10.0 gewoon open.
  const oldPkg = await OldT.makePackage(data190(), {});
  assert.equal((await T.openPackage(oldPkg)).error, undefined);
});

test('samenvoegen (overzetten naar een app met gegevens): oefeningen komen mee, zonder dubbelen; verwijderde blijven weg', () => {
  const base = data190();
  const inc = with110(structuredClone(base));
  const r = T.mergeTransfer(base, inc);
  assert.deepEqual(r.data.drills.map(x => x.id), ['dr1', 'dr2', 'dr3']);
  assert.deepEqual(T.mergeTransfer(r.data, inc).data.drills.length, 3, 'nogmaals: geen dubbelen');
  const v = T.verifyTransfer(inc, r.data);
  assert.equal(v.missing.length, 0); assert.equal(v.conflicts.length, 0);
  T.rememberRemoved(r.data, 'drills', ['dr2']);
  r.data.drills = r.data.drills.filter(x => x.id !== 'dr2');
  assert.deepEqual(T.mergeTransfer(r.data, inc).data.drills.map(x => x.id), ['dr1', 'dr3'], 'bewust verwijderd komt niet terug');
});

test('validatie: een kapotte oefening in een back-up wordt afgekeurd met een duidelijke melding', () => {
  const d = with110(data190());
  d.drills[0].turns[0].hits = 7;
  assert.match(S.parseBackup(S.makeBackup(d)).error, /Oefening 1 is ongeldig/);
});

test('beurttotaal: omzetten naar pijlen; uitgooien met dubbel; bust; onmogelijke totalen', () => {
  assert.deepEqual(L.totalToDarts(140, 301), ['X60', 'X60', 'X20']);
  assert.deepEqual(L.totalToDarts(0, 301), ['X0', 'X0', 'X0']);
  for (const v of [163, 166, 169, 172, 173, 175, 176, 178, 179, 181, -1, 1.5]) assert.equal(L.validTurnTotal(v), false, String(v));
  assert.equal(L.validTurnTotal(180), true);
  assert.deepEqual(L.totalToDarts(40, 40, { finishDarts: 1 }), ['D20']);
  assert.deepEqual(L.totalToDarts(50, 50, { finishDarts: 1 }), ['DB']);
  assert.equal(L.totalToDarts(41, 41, { finishDarts: 1 }), null, '41 kan niet met één pijl');
  for (const [v, n] of [[41, 2], [100, 2], [170, 3], [121, 3], [2, 1]]) {
    const darts = L.totalToDarts(v, v, { finishDarts: n });
    assert.equal(darts.length, n);
    const r = L.x01Turn(v, darts, true);
    assert.equal(r.finished, true, `${v} in ${n}`); assert.equal(r.scored, v);
  }
  assert.equal(L.totalToDarts(170, 170, { finishDarts: 2 }), null);
  // Bust: meer dan de rest, rest 1 overhouden, of precies 0 zonder dubbel.
  assert.equal(L.x01Turn(20, L.totalToDarts(30, 20)).bust, true);
  assert.equal(L.x01Turn(21, L.totalToDarts(20, 21)).bust, true);
  assert.equal(L.x01Turn(40, L.totalToDarts(40, 40)).bust, true, 'geen dubbel → bust');
  assert.equal(L.x01Turn(100, L.totalToDarts(60, 100)).remaining, 40);
  // Straight out: elke pijl mag uitgooien.
  const so = L.totalToDarts(59, 59, { doubleOut: false, finishDarts: 2 });
  assert.equal(L.x01Turn(59, so, false).finished, true);
});
