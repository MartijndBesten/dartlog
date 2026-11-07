// Club bij het bord: automatisch meetellen (js/club-auto.js) en de clubposter (club/poster.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pendingClubShares, setClubAuto, clubAutoFor, dropClubAuto, readClubAuto, autoShareClubs, weekStartLocal } from '../../js/club-auto.js';
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
