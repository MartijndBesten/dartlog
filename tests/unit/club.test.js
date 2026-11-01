// OKKIE. Club in de app: standaard uit, alleen samenvattingen naar de club, QR-bibliotheek lokaal en met licentie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clubTraining, shareableTrainings, clubAverage } from '../../js/club-share.js';
import { PARTS } from '../../tools/app-files.mjs';

const read = rel => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const turns = (n, darts = ['S20', 'S20', 'S20']) => Array.from({ length: n }, () => ({ darts }));
const t = (extra) => ({ id: 'x', playerId: 'p', kind: 'score', finishedAt: '2026-11-01T10:00:00Z', ...extra });

test('functievlag: CLUB_OPEN staat in productie uit en de app toont Club alleen met de vlag', async () => {
  const live = await import('../../community/config.js');
  assert.equal(live.CLUB_OPEN, false); assert.equal(live.API_BASE, live.PROD_API);
  const cfg = read('community/config.js');
  // Alleen lokaal of op het aparte staging-adres; overal anders (app.okkiedarts.nl, iPhone-app) uit en productie-API.
  assert.match(cfg, /export const CLUB_OPEN = LOCAL \? DEV\.club === true : STAGING;/);
  assert.match(cfg, /const STAGING = typeof location !== 'undefined' && location\.hostname === STAGING_APP;/);
  assert.match(cfg, /STAGING_APP = 'okkie-app-staging\.zaalverhuur-sion\.workers\.dev'/);
  assert.match(read('js/app.js'), /\$\{CLUB_OPEN \? `<a class="link-row" href="\.\/club\/"/);
  assert.match(read('club/club.js'), /if \(!CLUB_OPEN \|\| !apiAvailable\(\)\) unavailable\(/);
  assert.ok(PARTS.includes('club'), 'club/ hoort bij de app-bestanden');
});

test('alleen samenvattingen: soort, pijlen, punten en hoogste beurt; nooit losse pijlen of tijden', () => {
  const s = clubTraining(t({ limitTurns: 10, turns: turns(10) }));
  assert.deepEqual(s, { trainingId: 'x', kind: 'score30', darts: 30, points: 600, high: 60 });
  assert.deepEqual(Object.keys(s).sort(), ['darts', 'high', 'kind', 'points', 'trainingId']);
  assert.equal(clubTraining(t({ limitTurns: 20, turns: turns(20) })).kind, 'score60');
  assert.equal(clubTraining(t({ limitTurns: 33, turns: turns(33) })).kind, 'score99');
  assert.equal(clubTraining(t({ limitTurns: null, turns: turns(7) })).kind, 'free');
  assert.equal(clubTraining(t({ limitTurns: 10, turns: turns(4) })).kind, 'free', 'eerder gestopt: geen weekoefening');
});

test('niet deelbaar: lopend, geïmporteerd uit een andere app, onafgemaakte klok', () => {
  assert.equal(clubTraining(t({ finishedAt: null, turns: turns(10) })), null);
  assert.equal(clubTraining(t({ source: 'Andere app', summary: { darts: 30, points: 900 } })), null);
  const targets = [...Array(20).keys()].map(i => 'S' + (i + 1));
  assert.equal(clubTraining(t({ kind: 'clock', turns: [{ darts: targets.slice(0, 3) }] })), null);
  const full = clubTraining(t({ kind: 'clock', turns: [{ darts: [...targets, 'SB'] }] }));
  assert.deepEqual(full, { trainingId: 'x', kind: 'clock', darts: 21, points: 0 });
});

test('deelbare trainingen: alleen deze speler, laatste 7 dagen, nieuwste eerst', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const data = { trainings: [
    t({ id: 'a', finishedAt: '2026-11-07T10:00:00Z', limitTurns: 10, turns: turns(10) }),
    t({ id: 'b', finishedAt: '2026-10-20T10:00:00Z', limitTurns: 10, turns: turns(10) }),
    t({ id: 'c', playerId: 'q', finishedAt: '2026-11-07T11:00:00Z', limitTurns: 10, turns: turns(10) }),
    t({ id: 'd', finishedAt: '2026-11-08T09:00:00Z', limitTurns: 10, turns: turns(10) }),
  ] };
  assert.deepEqual(shareableTrainings(data, 'p', 7, now).map(x => x.t.id), ['d', 'a']);
  assert.equal(clubAverage(600, 30), 60);
});

test('QR-code: lokale MIT-bibliotheek (geen externe dienst), licentiekop behouden', async () => {
  const src = read('js/vendor/qrcode.mjs');
  assert.match(src, /Copyright \(c\) 2009 Kazuhiko Arase/);
  assert.match(src, /Licensed under the MIT license/);
  const { default: qrcode } = await import('../../js/vendor/qrcode.mjs');
  const q = qrcode(0, 'M'); q.addData('https://app.okkiedarts.nl/club/#club=K7M2Q9RT'); q.make();
  assert.match(q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }), /^<svg /);
  assert.doesNotMatch(read('club/club.js'), /https?:\/\/[^'"`]*qr/i, 'geen externe QR-dienst');
});

test('Darters uitzetten wist een clubprofiel niet (alleen niet meer openbaar)', () => {
  const app = read('community/app.js');
  assert.match(app, /if \(acct\.club\) \{[\s\S]*?request\('\/v1\/me', 'PATCH', \{ enabled: false \}/);
});

test('privacy: de Club-paragraaf staat als concept in de bron en gaat standaard niet mee naar okkiedarts.nl', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  assert.match(read('ontdek/privacy/index.html'), /<h2 id="club">6a\. OKKIE\. Club/);
  const env = { ...process.env }; delete env.OKKIE_CLUB_PUBLIC;
  execFileSync(process.execPath, ['tools/build-public-site.mjs'], { cwd: root, env, stdio: 'pipe' });
  const out = read('dist/privacy/index.html');
  assert.doesNotMatch(out, /id="club"|CONCEPT OKKIE/);
  assert.match(out, /<h2 id="kinderen">/);
});
