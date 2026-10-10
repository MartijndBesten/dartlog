import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../js/transfer.js';
import { emptyData } from '../../js/store.js';

const at = (d, h = 18) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const turns = (n, darts = ['T20', 'S5', 'D10']) => Array.from({ length: n }, () => ({ at: at(5), darts }));
const sample = () => ({
  ...emptyData(), activePlayerId: 'p1',
  players: [{ id: 'p1', name: 'Senn', color: '#3ddc84', createdAt: at(1) }, { id: 'p2', name: 'Mila', color: '#ff5a5f', createdAt: at(2) }],
  trainings: [
    ...Array.from({ length: 40 }, (_, i) => ({ id: 't' + i, playerId: i % 2 ? 'p2' : 'p1', kind: 'score', limitTurns: 10, startedAt: at(5), finishedAt: at(5, 19), turns: turns(10, i % 3 ? ['T20', 'S5', 'D10'] : ['S1', 'M', 'S20']) })),
    { id: 'c1', playerId: 'p1', kind: 'clock', limitTurns: null, startedAt: at(6), finishedAt: at(6), turns: [{ at: at(6), darts: ['S1', 'S2', 'S3'] }] },
    { id: 'dc1', playerId: 'p2', kind: 'score', limitTurns: 33, startedAt: at(1, 12), turns: [], summary: { points: 3500, darts: 99, high: 140 }, source: 'DartCounter', dateUnknown: true },
  ],
  matches: [{ id: 'm1', startedAt: at(7), finishedAt: at(7), settings: { start: 301, bestOf: 1, doubleOut: true }, players: [{ id: 'p1', name: 'Senn' }, { id: 'p2', name: 'Mila' }], legs: [{ starter: 0, turns: [{ p: 0, darts: ['T20', 'T20', 'T20'] }] }] }],
  active: { training: { id: 'a1', playerId: 'p1', players: ['p1'], kind: 'score', limitTurns: 10, startedAt: at(8), turns: [{ at: at(8), darts: ['S20', 'S20', 'S20'], p: 0 }], pending: ['T20'] }, match: null },
  settings: { theme: 'light', sound: false, vibrate: true },
});

// Kleine geheugenopslag zoals localStorage
function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, map: m };
}

test('overzetcode: alles komt exact terug, met vingerafdruk, ook lopende training, instellingen en extra sleutels', async () => {
  const d = sample();
  const extras = { 'okkie.community.v1': JSON.stringify({ version: 1, accounts: { p1: { token: 'x' } } }) };
  const code = await T.pack(d, extras);
  assert.ok(code.startsWith(T.PREFIX));
  assert.ok(code.length < JSON.stringify(d).length / 2, 'gecomprimeerd');
  const r = await T.unpack(' \n' + code.match(/.{1,60}/g).join('\n') + '\n ');   // ook met regelafbrekingen (plakken uit een appje)
  assert.equal(r.error, undefined);
  assert.deepEqual(r.data.trainings, d.trainings);
  assert.deepEqual(r.data.active.training, d.active.training);
  assert.equal(r.data.settings.theme, 'light');
  assert.deepEqual(r.extras, extras);
  assert.equal(r.fingerprint, await T.fingerprint(d));
});

test('onbruikbare of afgebroken code: duidelijke melding', async () => {
  const code = await T.pack(sample());
  for (const bad of ['', 'hallo', T.PREFIX + 'z:@@@', T.PREFIX + 'z:' + btoa('kapot'), code.slice(0, code.length - 40)]) {
    assert.ok((await T.unpack(bad)).error, bad.slice(0, 30));
  }
});

test('veranderde inhoud wordt herkend aan de vingerafdruk', async () => {
  const pkg = await T.makePackage(sample());
  pkg.data.trainings[3].turns[0].darts = ['T20', 'T20', 'T20'];
  assert.match((await T.openPackage(pkg)).error, /veranderd/);
});

test('vingerafdruk hangt af van inhoud, niet van volgorde', async () => {
  const a = sample(), b = sample();
  b.trainings.reverse(); b.players.reverse();
  assert.equal(await T.fingerprint(a), await T.fingerprint(b));
  b.trainings.find(t => t.id === 't3').turns[0].darts = ['M', 'M', 'M'];
  assert.notEqual(await T.fingerprint(a), await T.fingerprint(b));
});

test('lege nieuwe app: alles wordt overgenomen en de controle klopt per speler', async () => {
  const opened = await T.openPackage(await T.makePackage(sample()));
  const { data, report } = await T.receive(emptyData(), opened);
  assert.deepEqual(T.summary(data), { players: 2, trainings: 42, matches: 1, active: true });
  assert.equal(data.active.training.pending[0], 'T20');
  assert.equal(report.ok, true);
  assert.equal(report.sameContent, true);
  assert.equal(report.active, 'overgenomen');
  const senn = report.players.find(p => p.id === 'p1');
  assert.equal(senn.trainings, 21);   // 20 scoretrainingen + rond de klok
  assert.equal(senn.darts, 600);
  assert.equal(senn.same, true);
});

test('twee keer overzetten of al begonnen in de nieuwe app: geen dubbele, niets kwijt, eigen keuzes blijven', async () => {
  const nieuw = { ...emptyData(), activePlayerId: 'p9', players: [{ id: 'p9', name: 'Opa', color: '#fff', createdAt: at(9) }],
    trainings: [{ id: 'n1', playerId: 'p9', kind: 'score', limitTurns: 10, startedAt: at(9), finishedAt: at(9), turns: turns(1, ['S1', 'S1', 'S1']) }] };
  const opened = await T.openPackage(await T.makePackage(sample()));
  const once = (await T.receive(nieuw, opened)).data;
  const twice = await T.receive(once, opened);
  assert.deepEqual(T.summary(twice.data), { players: 3, trainings: 43, matches: 1, active: true });
  assert.equal(twice.data.activePlayerId, 'p9', 'eigen keuze in de nieuwe app blijft');
  assert.equal(twice.report.ok, true);
  assert.equal(twice.report.sameContent, true);
});

test('lopende training wordt niet overgenomen als hij hier al loopt of al is afgerond (geen dubbele telling)', async () => {
  const src = sample();
  // in de nieuwe app loopt al iets anders
  const busy = { ...structuredClone(src), active: { training: { ...src.active.training, id: 'eigen' }, match: null } };
  let r = T.mergeTransfer(busy, src);
  assert.equal(r.data.active.training.id, 'eigen');
  assert.equal(r.skippedActive, 'bezet');
  // dezelfde training is in de nieuwe app al afgerond na een eerdere overdracht
  const done = structuredClone(src);
  done.active.training = null;
  done.trainings.push({ ...src.active.training, finishedAt: at(8, 20), pending: undefined });
  r = T.mergeTransfer(done, src);
  assert.equal(r.data.active.training, null);
  assert.equal(r.skippedActive, 'afgerond');
  assert.equal(r.data.trainings.filter(t => t.id === 'a1').length, 1);
});

test('verschillende spelers met dezelfde voornaam blijven gescheiden; samenvoegen kan alleen bewust en veilig', async () => {
  const nieuw = { ...emptyData(), activePlayerId: 'x1', players: [{ id: 'x1', name: 'senn', color: '#fff', createdAt: at(9) }],
    trainings: [{ id: 'n1', playerId: 'x1', kind: 'score', limitTurns: 10, startedAt: at(9), finishedAt: at(9), turns: turns(10) }] };
  const { data } = await T.receive(nieuw, await T.openPackage(await T.makePackage(sample())));
  assert.equal(data.players.length, 3, 'niet stilzwijgend op naam samengevoegd');
  const pairs = T.sameNamePairs(data);
  assert.deepEqual(pairs.map(([a, b]) => [a.id, b.id]), [['x1', 'p1']]);
  const m = T.mergePlayers(data, 'p1', 'x1');
  assert.equal(m.error, undefined);
  assert.equal(m.data.players.length, 2);
  assert.equal(m.data.trainings.filter(t => t.playerId === 'p1').length, 22);
  assert.equal(m.data.activePlayerId, 'p1');
  assert.equal(m.data.trainings.length, data.trainings.length, 'geen training kwijt');
  // spelers die samen een wedstrijd speelden zijn nooit dezelfde persoon
  assert.match(T.mergePlayers(data, 'p1', 'p2').error, /samen gegooid/);
  // allebei online: niet samenvoegen
  assert.match(T.mergePlayers(data, 'p1', 'x1', { p1: {}, x1: {} }).error, /online profiel/);
});

test('extra sleutels: online profielen gaan mee maar overschrijven nooit iets', () => {
  const src = mem({ 'okkie.community.v1': JSON.stringify({ version: 1, accounts: { p1: { token: 'oud-p1' }, p2: { token: 'oud-p2' } } }), 'okkie.backup.last-count.p1': '20', 'oche.data': '{}', 'iets.anders': 'x' });
  const extras = T.readExtras(src);
  assert.deepEqual(Object.keys(extras).sort(), ['okkie.backup.last-count.p1', 'okkie.community.v1']);
  const dst = mem({ 'okkie.community.v1': JSON.stringify({ version: 1, accounts: { p1: { token: 'nieuw-p1' } } }), 'okkie.backup.last-count.p1': '30' });
  T.writeExtras(dst, { ...extras, 'oche.data': 'GEVAAR', 'okkie.guest.v1': '{"links":{},"queue":[]}' });
  const acc = JSON.parse(dst.getItem('okkie.community.v1')).accounts;
  assert.equal(acc.p1.token, 'nieuw-p1', 'bestaand profiel blijft');
  assert.equal(acc.p2.token, 'oud-p2', 'ontbrekend profiel komt erbij');
  assert.equal(dst.getItem('okkie.backup.last-count.p1'), '30');
  assert.equal(dst.getItem('oche.data'), null, 'trainingsgegevens nooit via extra sleutels');
  assert.equal(dst.getItem('okkie.guest.v1'), '{"links":{},"queue":[]}');
});

test('rollen: oud en nieuw adres; aankondiging staat standaard uit', () => {
  assert.equal(T.PROD.open, false);
  assert.equal(T.PROD.newApp, 'https://app.okkiedarts.nl/');
  assert.equal(T.role(), null, 'buiten de browser geen rol');
  assert.equal(T.announce(), false);
});

test('nog eens overzetten na hernoemen in de nieuwe app: alles is er, de nieuwe naam blijft, geen foutmelding', async () => {
  const opened = await T.openPackage(await T.makePackage(sample()));
  const first = (await T.receive(emptyData(), opened)).data;
  first.players.find(p => p.id === 'p1').name = 'Senn de Jong';
  const again = await T.receive(first, opened);
  assert.equal(again.report.ok, true);
  assert.equal(again.report.sameContent, false);
  assert.deepEqual(again.report.different, ['players:p1']);
  assert.equal(again.data.players.find(p => p.id === 'p1').name, 'Senn de Jong');
  assert.equal(again.data.trainings.length, 42);
});

test('ontbrekende training na samenvoegen wordt als fout gemeld', () => {
  const inc = sample();
  const merged = structuredClone(inc);
  merged.trainings = merged.trainings.filter(t => t.id !== 't5');
  const r = T.verifyTransfer(inc, merged);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['trainings:t5']);
});
