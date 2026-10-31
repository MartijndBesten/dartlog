// Rooktest in de simulator (tools/ios/smoke.sh): maak een duurzame kopie (js/native.js) met één speler en één
// training, alsof iOS de webviewopslag heeft opgeruimd. De app moet die bij het starten terugzetten.
import { writeFileSync } from 'node:fs';
import { createStore } from '../../js/store.js';
import { FORMAT, snapshot } from '../../js/native.js';

const m = new Map();
const storage = { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
const store = createStore(storage);
const { data } = store.load();
data.players.push({ id: 'sim-1', name: 'Simulator', color: '#3ddc84', createdAt: '2026-10-01T10:00:00.000Z' });
data.activePlayerId = 'sim-1';
data.trainings.push({ id: 'sim-t1', playerId: 'sim-1', kind: 'score', limitTurns: 1, startedAt: '2026-10-30T19:00:00.000Z', endedAt: '2026-10-30T19:02:00.000Z', turns: [{ darts: ['T20', 'T20', 'T20'] }] });
store.save(data);
writeFileSync(process.argv[2], JSON.stringify({ format: FORMAT, version: 1, seq: 1, savedAt: new Date().toISOString(), items: snapshot(storage) }));
console.log('Kopie met 1 speler en een 180 geschreven naar', process.argv[2]);
