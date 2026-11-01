// Fictieve demogegevens voor App Store-screenshots: speler Sem traint acht weken en wordt langzaam beter, plus Papa.
// Vaste willekeur, dus elke keer dezelfde plaatjes. Geen echte gebruikersgegevens.
// Gebruikt door tools/ios/appstore-screenshots.mjs (browser) en tools/ios/appstore-fixture.mjs (simulator).
export function demoData() {
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function dart(level) {
  const r = rnd();
  const n = rnd() < 0.55 + level * 0.25 ? 20 : [1, 5, 19, 3, 18, 12][Math.floor(rnd() * 6)];
  if (r < 0.04 + level * 0.1) return 'T' + n;
  if (r < 0.07 + level * 0.06) return 'D' + n;
  if (r > 0.985) return 'M';
  return 'S' + n;
}
const day = 864e5, start = Date.parse('2026-09-04T18:30:00Z');
const trainings = [];
for (let i = 0; i < 46; i++) {
  const t0 = start + Math.floor(i * 1.25) * day + (i % 3) * 3600e3;
  const level = Math.min(1, i / 52);
  const turns = Array.from({ length: i % 4 === 3 ? 20 : 10 }, (_, k) => ({ at: new Date(t0 + k * 40e3).toISOString(), darts: [dart(level), dart(level), dart(level)] }));
  if (i === 41) turns[4].darts = ['T20', 'T20', 'T20'];
  trainings.push({ id: 'demo-' + i, playerId: 'sem', kind: 'score', limitTurns: turns.length, startedAt: new Date(t0).toISOString(), finishedAt: new Date(t0 + turns.length * 40e3).toISOString(), turns });
}
return { version: 2, activePlayerId: 'sem', players: [
  { id: 'sem', name: 'Sem', color: '#3ddc84', createdAt: '2026-09-04T18:00:00.000Z' },
  { id: 'papa', name: 'Papa', color: '#ff5a5f', createdAt: '2026-09-04T18:00:00.000Z' }],
  trainings, matches: [], settings: { theme: 'dark', sound: false, vibrate: false, speech: true }, active: { training: null, match: null } };
}
