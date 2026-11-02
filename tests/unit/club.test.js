// OKKIE. Club in de app: standaard uit, alleen samenvattingen naar de club, QR-bibliotheek lokaal en met licentie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clubTraining, shareableTrainings, clubAverage } from '../../js/club-share.js';
import { PARTS } from '../../tools/app-files.mjs';

const read = rel => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const turns = (n, darts = ['S20', 'S20', 'S20']) => Array.from({ length: n }, () => ({ darts }));
const t = (extra) => ({ id: 'x', playerId: 'p', kind: 'score', finishedAt: '2026-11-01T10:00:00Z', ...extra });

test('Club live (1.9.0): aan in productie, op het startscherm en bij Darters, productie-API', async () => {
  const live = await import('../../community/config.js');
  assert.equal(live.CLUB_OPEN, true); assert.equal(live.API_BASE, live.PROD_API);
  const cfg = read('community/config.js');
  // Alleen lokaal of op het aparte staging-adres; overal anders (app.okkiedarts.nl, iPhone-app) uit en productie-API.
  assert.match(cfg, /export const CLUB_OPEN = LOCAL \? DEV\.club === true : true;/);
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

test('privacy: de Club-paragraaf staat in de gepubliceerde privacyverklaring; startscherm en Darters verwijzen naar Club', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  execFileSync(process.execPath, ['tools/build-public-site.mjs'], { cwd: root, stdio: 'pipe' });
  const out = read('dist/privacy/index.html');
  assert.match(out, /<h2 id="club">6a\. OKKIE\. Club/);
  assert.doesNotMatch(out, /CONCEPT/);
  assert.match(read('js/app.js'), /data-testid="club-home"/);
  assert.match(read('community/index.html'), /href="\.\.\/club\/" data-testid="darters-club"/);
  assert.match(read('club/club.js'), /INVITE_PAGE = 'https:\/\/okkiedarts\.nl\/club\/uitnodiging\/'/);
  assert.match(read('club/club.js'), /data-testid="report-exercise"/);
});

test("club 1.10.0: Bob's 27 en 121 gaan als eindscore naar de club, nooit met rondes of pijlen", async () => {
  const { clubDrill, shareableTrainings, clubValue } = await import('../../js/club-share.js');
  const { BOBS_TARGETS } = await import('../../js/drills.js');
  const at = new Date().toISOString();
  const bobs = { id: 'd1', playerId: 'p', kind: 'bobs27', startedAt: at, finishedAt: at, turns: BOBS_TARGETS.map(target => ({ at, target, hits: 1 })) };
  const s = clubDrill(bobs);
  assert.deepEqual(Object.keys(s).sort(), ['darts', 'kind', 'points', 'trainingId']);
  assert.equal(s.darts, 63); assert.equal(s.kind, 'bobs27');
  assert.equal(clubDrill({ ...bobs, turns: bobs.turns.slice(0, 20) }), null, 'niet afgemaakt: niet delen');
  const c = clubDrill({ id: 'd2', playerId: 'p', kind: 'c121', startedAt: at, finishedAt: at, turns: [{ target: 121, darts: ['T20', 'T11', 'D14'] }, { target: 122, darts: ['S1', 'S1', 'S1'] }] });
  assert.deepEqual(c, { trainingId: 'd2', kind: 'c121', darts: 6, points: 121 });
  assert.equal(clubDrill({ id: 'd3', playerId: 'p', kind: 'c121', startedAt: at, finishedAt: at, turns: [{ target: 121, darts: ['S1'] }] }), null, 'niets uitgegooid');
  assert.equal(clubDrill({ ...bobs, kind: 'clockD' }), null, 'klokvarianten niet');
  const list = shareableTrainings({ trainings: [], drills: [bobs] }, 'p');
  assert.equal(list.length, 1);
  assert.equal(clubValue('bobs27', { points: 412 }), '412 punten');
  assert.equal(clubValue('c121', { points: 124 }), 'niveau 124');
});
