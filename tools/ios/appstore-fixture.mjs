// Demogegevens (tools/ios/appstore-demo-data.mjs) als duurzame kopie voor de App Store-screenshots in de simulator
// (ios/App/OKKIEUITests/AppStoreScreenshots.swift). Formaat: js/native.js. Geen echte gebruikersgegevens.
//   node tools/ios/appstore-fixture.mjs   → schrijft ios/App/OKKIEUITests/ScreenshotFixture.swift
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMAT, snapshot } from '../../js/native.js';
import { demoData } from './appstore-demo-data.mjs';

export function screenshotMirror() {
  const m = new Map();
  const storage = { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  storage.setItem('oche.data', JSON.stringify(demoData()));
  storage.setItem('okkie.backup.last-count.sem', '46');   // geen back-upherinnering in beeld
  return { format: FORMAT, version: 1, seq: 1, savedAt: '2026-10-31T19:00:00.000Z', items: snapshot(storage) };
}

export function screenshotFixtureSwift() {
  const json = JSON.stringify(screenshotMirror());
  if (json.includes('"##')) throw new Error('JSON past niet in een Swift raw string');
  return `// GEGENEREERD door tools/ios/appstore-fixture.mjs — niet met de hand wijzigen.
// Fictieve demogegevens (Sem en Papa) voor de App Store-screenshots, in het formaat van de duurzame kopie.
enum ScreenshotFixture {
    static let mirror = ##"${json}"##
}
`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const out = fileURLToPath(new URL('../../ios/App/OKKIEUITests/ScreenshotFixture.swift', import.meta.url));
  writeFileSync(out, screenshotFixtureSwift());
  console.log('Geschreven:', out);
}
