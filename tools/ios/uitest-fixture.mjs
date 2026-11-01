// Vaste testdata voor de XCUITests (ios/App/OKKIEUITests). Eén verzonnen speler met twee scoretrainingen waarvan de
// uitkomst vastligt, in het formaat van de duurzame kopie (js/native.js). De app zet die bij het starten terug, net
// als na het wissen van de webviewopslag. Geen echte gebruikersgegevens.
//   node tools/ios/uitest-fixture.mjs          → schrijft ios/App/OKKIEUITests/Fixture.swift
//   node tools/ios/uitest-fixture.mjs --print  → toont de JSON
// Verwacht in de app (Statistieken): gemiddelde 66,00 over 2 trainingen, beste 72,00, slechtste 60,00, hoogste beurt 180.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStore } from '../../js/store.js';
import { FORMAT, snapshot } from '../../js/native.js';

export const FIXTURE_PLAYER = 'Testspeler';

export function fixtureMirror() {
  const m = new Map();
  const storage = { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  const store = createStore(storage);
  const { data } = store.load();
  data.players.push({ id: 'ui-1', name: FIXTURE_PLAYER, color: '#3ddc84', createdAt: '2026-10-01T10:00:00.000Z' });
  data.activePlayerId = 'ui-1';
  const turns = (day, list) => list.map((darts, i) => ({ at: `2026-10-${day}T19:${String(i + 1).padStart(2, '0')}:00.000Z`, darts }));
  const s20 = ['S20', 'S20', 'S20'];
  // Training 1: 10 × 60 = 600 punten uit 30 pijlen → 60,00
  data.trainings.push({ id: 'ui-t1', playerId: 'ui-1', kind: 'score', limitTurns: 10, startedAt: '2026-10-20T19:00:00.000Z', finishedAt: '2026-10-20T19:15:00.000Z', turns: turns(20, Array(10).fill(s20)) });
  // Training 2: 180 + 9 × 60 = 720 punten uit 30 pijlen → 72,00
  data.trainings.push({ id: 'ui-t2', playerId: 'ui-1', kind: 'score', limitTurns: 10, startedAt: '2026-10-25T19:00:00.000Z', finishedAt: '2026-10-25T19:15:00.000Z', turns: turns(25, [['T20', 'T20', 'T20'], ...Array(9).fill(s20)]) });
  store.save(data);
  return { format: FORMAT, version: 1, seq: 1, savedAt: '2026-10-25T19:16:00.000Z', items: snapshot(storage) };
}

export function fixtureSwift() {
  const json = JSON.stringify(fixtureMirror());
  if (json.includes('"##')) throw new Error('JSON past niet in een Swift raw string');
  return `// GEGENEREERD door tools/ios/uitest-fixture.mjs — niet met de hand wijzigen.
// Vaste testdata (verzonnen speler "${FIXTURE_PLAYER}", twee trainingen) in het formaat van de duurzame kopie.
enum Fixture {
    static let player = "${FIXTURE_PLAYER}"
    static let mirror = ##"${json}"##
}
`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  if (process.argv.includes('--print')) console.log(JSON.stringify(fixtureMirror(), null, 2));
  else {
    const out = fileURLToPath(new URL('../../ios/App/OKKIEUITests/Fixture.swift', import.meta.url));
    writeFileSync(out, fixtureSwift());
    console.log('Geschreven:', out);
  }
}
