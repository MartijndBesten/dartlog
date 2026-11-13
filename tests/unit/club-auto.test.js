// Club bij het bord: automatisch meetellen (js/club-auto.js) en de clubposter (club/poster.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pendingClubShares, setClubAuto, clubAutoFor, dropClubAuto, readClubAuto, autoShareClubs, weekStartLocal, exerciseFits } from '../../js/club-auto.js';
import { posterHtml, readPosterHash, groupCode, INVITE_PAGE } from '../../club/poster.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const turns = n => Array.from({ length: n }, () => ({ darts: ['S20', 'S20', 'S20'] }));
const tr = (id, finishedAt, extra = {}) => ({ id, playerId: 'p', kind: 'score', limitTurns: 10, startedAt: finishedAt, finishedAt, turns: turns(10), ...extra });
const read = rel => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');

test('alleen trainingen ná het aanzetten, niet dubbel, oudste eerst; weekoefening alleen voor deze week', () => {
  const now = new Date('2026-11-07T20:00:00');   // zaterdag
  const data = { players: [{ id: 'p' }], trainings: [
    tr('oud', '2026-10-30T10:00:00'),             // vóór het aanzetten
    tr('vrijdag', '2026-11-06T10:00:00'),
    tr('vorigeweek', '2026-11-01T10:00:00'),      // na het meedoen, maar vorige week (zondag)
    tr('a', '2026-11-07T19:00:00'),
    tr('b', '2026-11-07T19:30:00'),
    tr('ander', '2026-11-07T19:40:00', { playerId: 'q' }),
    tr('lopend', null),
  ] };
  const links = { p: { C1: { name: 'De Roos', on: true, since: '2026-10-31T12:00:00', sent: ['b'] } } };
  const out = pendingClubShares(data, links, now);
  // 'vrijdag' (6 nov) valt na het aanzetten (31 okt) en in deze week (maandag 2 nov); 'vorigeweek' alleen naar de feed.
  assert.deepEqual(out.map(x => [x.training.trainingId, x.challenge]), [['vorigeweek', false], ['vrijdag', 'auto'], ['a', 'auto']]);
  assert.deepEqual(Object.keys(out[0].training).sort(), ['darts', 'high', 'kind', 'points', 'trainingId'], 'alleen de samenvatting');
  // Uit = niets; onbekende speler = niets.
  assert.deepEqual(pendingClubShares(data, { p: { C1: { ...links.p.C1, on: false } } }, now), []);
  assert.deepEqual(pendingClubShares(data, { x: links.p }, now), []);
  assert.equal(weekStartLocal(now).getDay(), 1);
});

test('aanzetten telt vanaf nu, uitzetten en weer aanzetten begint opnieuw; verlaten wist de koppeling', () => {
  const s = mem();
  setClubAuto('p', 'C1', { name: 'De Roos', on: true }, s, new Date('2026-11-07T10:00:00Z'));
  assert.equal(clubAutoFor('p', 'C1', s).since, '2026-11-07T10:00:00.000Z');
  setClubAuto('p', 'C1', { on: true }, s, new Date('2026-11-07T11:00:00Z'));
  assert.equal(clubAutoFor('p', 'C1', s).since, '2026-11-07T10:00:00.000Z', 'al aan: datum blijft');
  assert.equal(clubAutoFor('p', 'C1', s).name, 'De Roos');
  setClubAuto('p', 'C1', { on: false }, s, new Date('2026-11-07T12:00:00Z'));
  setClubAuto('p', 'C1', { on: true }, s, new Date('2026-11-07T13:00:00Z'));
  assert.equal(clubAutoFor('p', 'C1', s).since, '2026-11-07T13:00:00.000Z', 'opnieuw aan: vanaf nu (niet met terugwerkende kracht)');
  dropClubAuto('p', 'C1', s);
  assert.deepEqual(readClubAuto(s).links, {});
});

test('versturen: wachtend lid (404) blijft staan, ongeldig (409) niet opnieuw, offline stopt; feed + weekoefening "auto"', async () => {
  const s = mem();
  const now = new Date('2026-11-07T20:00:00');
  setClubAuto('p', 'C1', { name: 'De Roos', on: true }, s, new Date('2026-11-07T08:00:00'));
  const data = { players: [{ id: 'p' }], trainings: [tr('a', '2026-11-07T19:00:00'), tr('b', '2026-11-07T19:30:00')] };
  const calls = [];
  let mode = 'pending';
  const send = async (path, method, body, token) => {
    calls.push([path, method, body.training.trainingId, body.feed, body.challenge, token]);
    if (mode === 'pending') throw Object.assign(new Error('Club niet gevonden.'), { status: 404 });
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    if (body.training.trainingId === 'a') throw Object.assign(new Error('x'), { status: 409 });
    return { challenge: { best: true, value: 600 }, feed: true };
  };
  const token = id => (id === 'p' ? 'tok' : null);
  assert.deepEqual(await autoShareClubs(data, { send, token, storage: s, now }), []);
  assert.equal(calls.length, 1, 'na 404 de rest van die club overslaan');
  assert.deepEqual(calls[0], ['/v1/clubs/C1/trainings', 'POST', 'a', true, 'auto', 'tok']);
  assert.deepEqual(clubAutoFor('p', 'C1', s).sent, [], 'blijft staan tot toegelaten');
  mode = 'offline';
  assert.deepEqual(await autoShareClubs(data, { send, token, storage: s, now }), []);
  assert.deepEqual(clubAutoFor('p', 'C1', s).sent, []);
  mode = 'ok';
  const done = await autoShareClubs(data, { send, token, storage: s, now });
  assert.deepEqual(done.map(x => [x.training.trainingId, x.clubName, x.challengeResult.best]), [['b', 'De Roos', true]]);
  assert.deepEqual(clubAutoFor('p', 'C1', s).sent.sort(), ['a', 'b'], '409 als verstuurd gemarkeerd');
  calls.length = 0;
  assert.deepEqual(await autoShareClubs(data, { send, token, storage: s, now }), []);
  assert.equal(calls.length, 0, 'niets dubbel');
});

test('poster: clubnaam als tekst, QR met de uitnodigingslink, code in groepjes; alleen geldige codes', () => {
  assert.equal(groupCode('K7M2Q9RT'), 'K7M2 Q9RT');
  assert.equal(groupCode('K7M2Q9RTAB'), 'K7M2 Q9RT AB');
  assert.deepEqual(readPosterHash('#code=k7m2q9rt&club=De%20Roos&direct=1&label=Bord%202'), { code: 'K7M2Q9RT', club: 'De Roos', direct: true, label: 'Bord 2' });
  assert.equal(readPosterHash('#code=K7M2Q9R0&club=De%20Roos'), null, '0 zit niet in het alfabet');
  assert.equal(readPosterHash('#code=K7M2Q9RT&club=X'), null);
  const html = posterHtml({ code: 'K7M2Q9RT', club: '<b>De Roos</b>', direct: false, label: '' });
  assert.match(html, /&lt;b&gt;De Roos&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>De Roos<\/b>/);
  assert.match(html, /Scan deze code en speel mee voor/);
  assert.match(html, /De beheerder laat nieuwe spelers eerst toe/);
  assert.match(posterHtml({ code: 'K7M2Q9RT', club: 'De Roos', direct: true }), /tellen direct mee voor de club/);
  assert.match(html, /<svg /);
  assert.equal(INVITE_PAGE, 'https://okkiedarts.nl/club/uitnodiging/');
  assert.doesNotMatch(read('club/poster.js'), /fetch\(|https?:\/\/[^'"`]*qr/i, 'geen server of externe QR-dienst');
});

test('app: automatisch meetellen na training en oefening, startlink vanuit de club, serviceworker kent de bestanden', () => {
  const app = read('js/app.js');
  assert.match(app, /queueCommunitySync\(data, saved\.map\(tr => tr\.playerId\)\);\n  clubAuto\(\);/);
  assert.match(app, /\(data\.drills \|\|= \[\]\)\.push\(saved\);\n  save\(\);\n  clubAuto\(\);/);
  assert.match(app, /if \(link\.has\('start'\)\)/);
  const sw = read('sw.js');
  for (const f of ['./js/club-auto.js', './js/club-share.js']) assert.ok(sw.includes(`'${f}'`), f);
});

test('eigen clubtrainingen: passende training telt mee; met een server van vóór 1.12.0 stuurt de app zelf in', async () => {
  const ex = (extra = {}) => ({ id: 'e1', name: 'Clubavond 30', kind: 'score', darts: 30, startsOn: '2026-11-02', endsOn: '2026-11-08', open: true, canSubmit: true, ...extra });
  const t30 = { trainingId: 'a', kind: 'score30', darts: 30, points: 600 };
  assert.equal(exerciseFits(ex(), t30, '2026-11-07'), true);
  assert.equal(exerciseFits(ex(), { ...t30, kind: 'free' }, '2026-11-07'), true, 'vrij trainen met hetzelfde aantal pijlen');
  assert.equal(exerciseFits(ex({ darts: 45 }), t30, '2026-11-07'), false, 'ander aantal pijlen');
  assert.equal(exerciseFits(ex(), t30, '2026-11-01'), false, 'gegooid vóór de looptijd');
  assert.equal(exerciseFits(ex({ open: false }), t30, '2026-11-07'), false);
  assert.equal(exerciseFits(ex({ canSubmit: false }), t30, '2026-11-07'), false, 'training van een ander team');
  assert.equal(exerciseFits(ex({ kind: 'clock', darts: null }), { trainingId: 'k', kind: 'clock', darts: 40, points: 0 }, '2026-11-07'), true);
  assert.equal(exerciseFits(ex({ kind: 'target' }), t30, '2026-11-07'), false, 'doel-oefening voer je zelf in');
  assert.equal(exerciseFits(ex(), { trainingId: 'b', kind: 'bobs27', darts: 63, points: 100 }, '2026-11-07'), false);

  const now = new Date('2026-11-07T20:00:00');
  const data = { players: [{ id: 'p' }], trainings: [tr('a', '2026-11-07T19:00:00')] };
  const run = async server => {
    const s = mem(), calls = [];
    setClubAuto('p', 'C1', { name: 'De Roos', on: true }, s, new Date('2026-11-07T08:00:00'));
    const send = async (path, method, body) => {
      calls.push(method + ' ' + path);
      if (path.endsWith('/trainings')) return server === 'nieuw' ? { feed: true, exercises: [{ id: 'e1', name: 'Clubavond 30', best: true, value: 600 }] } : { feed: true };
      if (path.endsWith('/exercises')) return { exercises: [ex(), ex({ id: 'e2', name: 'Andere', darts: 60 })] };
      assert.deepEqual(body, { trainingId: 'a', darts: 30, points: 600 });
      return { best: true, value: 600 };
    };
    const done = await autoShareClubs(data, { send, token: () => 'tok', storage: s, now });
    return { calls, results: done[0].exerciseResults };
  };
  const nieuw = await run('nieuw');
  assert.deepEqual(nieuw.calls, ['POST /v1/clubs/C1/trainings'], 'nieuwe server doet het zelf');
  assert.deepEqual(nieuw.results, [{ id: 'e1', name: 'Clubavond 30', best: true, value: 600 }]);
  const oud = await run('oud');
  assert.deepEqual(oud.calls, ['POST /v1/clubs/C1/trainings', 'GET /v1/clubs/C1/exercises', 'POST /v1/clubs/C1/exercises/e1/results']);
  assert.deepEqual(oud.results, [{ id: 'e1', name: 'Clubavond 30', best: true, value: 600 }]);
});
