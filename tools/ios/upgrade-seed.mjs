// Updatetest 1.8.0 → nieuwe versie (tools/ios/upgrade-test.sh): realistische gegevens van een bestaande speler.
//   node tools/ios/upgrade-seed.mjs write <kopiebestand>              duurzame kopie (formaat js/native.js) schrijven
//   node tools/ios/upgrade-seed.mjs check-old <map-oude-versie>       gegevens zijn geldig voor de oude versie
//   node tools/ios/upgrade-seed.mjs verify <kopiebestand-na-update>   alles nog aanwezig en ongewijzigd na de update
// Fictieve spelers; raakt geen server.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const at = (d, h = 19, m = 0) => new Date(Date.UTC(2026, 9, d, h, m)).toISOString();
const turns = (d, list) => list.map((darts, i) => ({ at: at(d, 19, i), darts }));
export const DATA = {
  version: 2, activePlayerId: 'upd-senn',
  players: [
    { id: 'upd-senn', name: 'Senn', color: '#3ddc84', createdAt: at(1) },
    { id: 'upd-mila', name: 'Mila', color: '#ff5a5f', createdAt: at(1) },
    { id: 'upd-opa', name: 'Opa Kees', color: '#ffc53d', createdAt: at(2) },
  ],
  trainings: [
    { id: 'upd-t1', playerId: 'upd-senn', kind: 'score', limitTurns: 3, startedAt: at(3), finishedAt: at(3, 19, 5), turns: turns(3, [['T20', 'T20', 'T20'], ['S20', 'S5', 'S1'], ['T19', 'S19', 'M']]) },
    { id: 'upd-t2', playerId: 'upd-senn', kind: 'score', limitTurns: 2, startedAt: at(5), finishedAt: at(5, 19, 4), turns: turns(5, [['T20', 'S20', 'S20'], ['D20', 'S20', 'T5']]) },
    { id: 'upd-t3', playerId: 'upd-mila', kind: 'score', limitTurns: 2, startedAt: at(5, 20), finishedAt: at(5, 20, 4), groupId: 'upd-g1', groupPlayers: ['upd-mila', 'upd-opa'], turns: turns(5, [['S5', 'S5', 'S1'], ['S20', 'S1', 'M']]) },
    { id: 'upd-t4', playerId: 'upd-opa', kind: 'score', limitTurns: 2, startedAt: at(5, 20), finishedAt: at(5, 20, 4), groupId: 'upd-g1', groupPlayers: ['upd-mila', 'upd-opa'], turns: turns(5, [['S20', 'S20', 'S20'], ['T20', 'S1', 'S5']]) },
    { id: 'upd-c1', playerId: 'upd-senn', kind: 'clock', limitTurns: null, startedAt: at(7), finishedAt: at(7, 19, 9), turns: turns(7, [['S1', 'S2', 'D3'], ['S4', 'M', 'S5']]) },
  ],
  matches: [
    { id: 'upd-m1', startedAt: at(8), finishedAt: at(8, 19, 30), players: [{ id: 'upd-senn', name: 'Senn' }, { id: 'upd-opa', name: 'Opa Kees' }],
      settings: { start: 301, bestOf: 1, doubleOut: true },
      legs: [{ starter: 0, turns: [{ p: 0, darts: ['T20', 'T20', 'T20'] }, { p: 1, darts: ['S20', 'S20', 'S20'] }, { p: 0, darts: ['T20', 'T20', 'S1'] }, { p: 1, darts: ['S1', 'S1', 'S1'] }, { p: 0, darts: ['D10'] }] }] },
  ],
  settings: { theme: 'light', sound: false, vibrate: true, speech: true, speechLevel: 'highlights' },
  active: { training: null, match: null },
};
export const EXTRA = {
  'okkie.community.v1': JSON.stringify({ version: 1, accounts: { 'upd-senn': { id: 'm-upd', handle: 'updtest0senn', nickname: 'Senn', token: 'x'.repeat(64), recovery: 'y'.repeat(64) } } }),
  'okkie.backup.last-count.upd-senn': '3',
  'okkie.darters.verborgen': JSON.stringify(['abcdefabcdef']),
  'okkie.install.v1': JSON.stringify({ offeredAt: at(1) }),
};
export const items = () => ({ 'oche.data': JSON.stringify(DATA), ...EXTRA });

// Na de update: niets kwijt en niets veranderd. Nieuwe velden van de nieuwe versie mogen erbij komen.
export function verify(after) {
  const problems = [];
  const a = after.items || {};
  for (const [k, v] of Object.entries(EXTRA)) if (a[k] !== v) problems.push(`sleutel ${k} ${a[k] == null ? 'ontbreekt' : 'is gewijzigd'}`);
  let d; try { d = JSON.parse(a['oche.data']); } catch { problems.push('oche.data ontbreekt of is onleesbaar'); return problems; }
  const byId = l => Object.fromEntries((l || []).map(x => [x.id, x]));
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (const kind of ['players', 'trainings', 'matches']) {
    const got = byId(d[kind]);
    for (const want of DATA[kind]) {
      const g = got[want.id];
      if (!g) { problems.push(`${kind} ${want.id} ontbreekt`); continue; }
      for (const [k, v] of Object.entries(want)) if (!same(g[k], v)) problems.push(`${kind} ${want.id}.${k} gewijzigd`);
    }
  }
  for (const [k, v] of Object.entries(DATA.settings)) if (!same(d.settings?.[k], v)) problems.push(`instelling ${k} gewijzigd`);
  if (d.activePlayerId !== DATA.activePlayerId) problems.push('actieve speler gewijzigd');
  return problems;
}

const [cmd, arg] = process.argv.slice(2);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (cmd === 'write') {
    writeFileSync(arg, JSON.stringify({ format: 'okkie-native-opslag', version: 1, seq: 1, savedAt: new Date().toISOString(), items: items() }));
    console.log('Kopie met 3 spelers, 5 trainingen, 1 wedstrijd en instellingen geschreven.');
  } else if (cmd === 'check-old') {
    // Met de store.js van de oude versie laden: geldig, niets afgekeurd of "beschadigd".
    const { createStore } = await import(pathToFileURL(join(resolve(arg), 'js/store.js')).href);
    const m = new Map(Object.entries(items()));
    const st = { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
    const r = createStore(st).load();
    const bad = [...m.keys()].filter(k => /beschadigd/.test(k));
    if (bad.length || r.data.trainings.length !== DATA.trainings.length) { console.error('Oude versie keurt de testgegevens af', bad, r.data.trainings.length); process.exit(1); }
    console.log(`Oude versie accepteert de testgegevens (${r.data.players.length} spelers, ${r.data.trainings.length} trainingen, ${r.data.matches.length} wedstrijd).`);
  } else if (cmd === 'verify') {
    const p = verify(JSON.parse(readFileSync(arg, 'utf8')));
    if (p.length) { console.error('Gegevens NIET behouden:\n- ' + p.join('\n- ')); process.exit(1); }
    console.log('Alle spelers, trainingen (elke pijl), wedstrijd, instellingen, online profiel en andere sleutels behouden.');
  } else { console.error('Gebruik: write <bestand> | check-old <map> | verify <bestand>'); process.exit(2); }
}
