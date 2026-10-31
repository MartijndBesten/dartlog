// iPhone-app: duurzame kopie van localStorage (js/native.js). Zonder iPhone getest met een nep-bestandssysteem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, pickNewest, restoreInto, createMirror, durableKey, isNative, publicUrl, saveFile, haptic, SLOTS, FORMAT } from '../../js/native.js';
import { createStore } from '../../js/store.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    dump: () => Object.fromEntries(m),
  };
}
function memFs() {
  const files = new Map();
  return { files, read: async n => files.get(n) ?? null, write: async (n, t) => { files.set(n, t); } };
}
const sync = () => ({ timer: fn => { fn(); return 1; }, clear: () => {} });

test('alleen OKKIE.-sleutels gaan mee, test- en foutsleutels niet', () => {
  for (const k of ['oche.data', 'okkie.community.v1', 'okkie.guest.v1', 'okkie.backup.last-count.p1', 'okkie.darters.verborgen', 'dartlog.v1']) assert.ok(durableKey(k), k);
  for (const k of ['okkie.dev', 'okkie.errors', 'iets.anders', '', null]) assert.ok(!durableKey(k), String(k));
  const s = memStorage({ 'oche.data': '{}', 'okkie.dev': '{"api":"x"}', 'ander': '1' });
  assert.deepEqual(snapshot(s), { 'oche.data': '{}' });
});

test('nieuwste geldige kopie wint; kapotte of halve bestanden tellen niet', () => {
  const doc = seq => JSON.stringify({ format: FORMAT, version: 1, seq, items: { 'oche.data': String(seq) } });
  assert.equal(pickNewest([doc(3), doc(4)]).seq, 4);
  assert.equal(pickNewest([doc(7), doc(4)]).seq, 7);
  assert.equal(pickNewest([doc(5), doc(6).slice(0, 30)]).seq, 5, 'afgebroken schrijfactie: vorige blijft bruikbaar');
  assert.equal(pickNewest([null, '{"format":"iets"}']), null);
  assert.equal(pickNewest([]), null);
});

test('terugzetten alleen als oche.data ontbreekt, en nooit iets overschrijven', () => {
  const mirror = { format: FORMAT, seq: 2, savedAt: '2026-10-31T10:00:00.000Z', items: { 'oche.data': '{"a":1}', 'okkie.community.v1': '{"c":1}', 'okkie.dev': 'nee' } };
  const leeg = memStorage();
  const r = restoreInto(leeg, mirror);
  assert.equal(r.restored, true);
  assert.deepEqual(leeg.dump(), { 'oche.data': '{"a":1}', 'okkie.community.v1': '{"c":1}' });
  const vol = memStorage({ 'oche.data': '{"nieuw":true}' });
  assert.equal(restoreInto(vol, mirror).restored, false);
  assert.deepEqual(vol.dump(), { 'oche.data': '{"nieuw":true}' }, 'localStorage met gegevens is leidend');
  assert.equal(restoreInto(memStorage(), { format: FORMAT, seq: 1, items: {} }).restored, false, 'kopie zonder trainingen zet niets terug');
});

test('kopie schrijft om en om naar A en B, alleen bij wijzigingen, nooit zonder trainingen', async () => {
  const storage = memStorage(), fs = memFs();
  const m = createMirror({ fs, storage, ...sync() });
  assert.equal(await m.write(), false, 'nog geen oche.data: niets schrijven');
  storage.setItem('oche.data', '1');
  assert.equal(await m.write(), true);
  assert.equal(await m.write(), false, 'niets veranderd');
  storage.setItem('oche.data', '2');
  assert.equal(await m.write(), true);
  assert.deepEqual([...fs.files.keys()].sort(), [...SLOTS].sort());
  assert.equal(JSON.parse(fs.files.get(SLOTS[1])).items['oche.data'], '1');
  assert.equal(JSON.parse(fs.files.get(SLOTS[0])).items['oche.data'], '2');
  // Opnieuw starten: volgnummer gaat verder waar het was.
  const m2 = createMirror({ fs, storage, ...sync() });
  assert.equal((await m2.load()).seq, 2);
  storage.setItem('okkie.guest.v1', 'g');
  await m2.write();
  assert.equal(m2.seq, 3);
});

test('een mislukte schrijfactie breekt niets: de vorige kopie blijft staan', async () => {
  const storage = memStorage({ 'oche.data': 'v1' }), fs = memFs();
  const m = createMirror({ fs, storage, ...sync() });
  await m.write();
  fs.write = async () => { throw new Error('schijf vol'); };
  storage.setItem('oche.data', 'v2');
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(await m.write(), false); } finally { console.warn = warn; }
  assert.equal(pickNewest([...fs.files.values()]).items['oche.data'], 'v1');
});

test('de hele route: echte gegevens, webviewopslag gewist, alles terug inclusief online profiel', async () => {
  const storage = memStorage(), fs = memFs();
  const store = createStore(storage);
  const { data } = store.load();
  data.players.push({ id: 'p1', name: 'Senn', color: '#3ddc84', createdAt: '2026-10-01T10:00:00.000Z' });
  data.activePlayerId = 'p1';
  data.trainings.push({ id: 't1', playerId: 'p1', kind: 'score', limitTurns: 1, startedAt: '2026-10-02T10:00:00.000Z', endedAt: '2026-10-02T10:05:00.000Z', turns: [{ darts: ['T20', 'T20', 'T20'] }] });
  store.save(data);
  storage.setItem('okkie.community.v1', JSON.stringify({ version: 1, accounts: { p1: { handle: 'abcdefabcdef', token: 't', recovery: 'r' } } }));
  const before = storage.dump();
  await createMirror({ fs, storage, ...sync() }).write();
  storage.clear();   // iOS ruimt de webviewopslag op
  const m = createMirror({ fs, storage, ...sync() });
  const r = restoreInto(storage, await m.load());
  assert.equal(r.restored, true);
  assert.deepEqual(storage.dump(), before);
  const again = createStore(storage).load();
  assert.equal(again.data.trainings[0].turns[0].darts.join(' '), 'T20 T20 T20');
  assert.equal(again.data.players[0].name, 'Senn');
});

test('in de browser (geen Capacitor) doet de app-laag niets', async () => {
  assert.equal(isNative(), false);
  assert.equal(haptic(12), false);
  assert.equal(await saveFile('x.json', new Blob(['{}'])), 'web');
  assert.equal(publicUrl('community/', { href: 'https://app.okkiedarts.nl/' }), 'https://app.okkiedarts.nl/community/');
  assert.equal(publicUrl('community/', null), 'https://app.okkiedarts.nl/community/');
});
