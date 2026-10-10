import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkGuest, guestLink, claimGuests, releaseGuests, queueGuestTrainings, readGuest, guestSummary, normalizeCode, prettyCode, OTHER_PHONE } from '../../js/guest-sync.js';
import { publicSnapshots } from '../../js/community-sync.js';
import { summaryTraining } from '../../js/store.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const turn = darts => ({ at: '2026-10-08T19:00:00Z', darts });
const tr = (id, playerId, turns, finishedAt = '2026-10-08T19:30:00Z') => ({ id, playerId, kind: 'score', startedAt: finishedAt, finishedAt, turns });

test('code: hoofdletters, zonder streepje of spaties', () => {
  assert.equal(normalizeCode(' k7pm-4qxr '), 'K7PM4QXR');
  assert.equal(prettyCode('k7pm4qxr'), 'K7PM-4QXR');
});

test('één code hoort bij precies één training; zonder worpen komt hij weer vrij', () => {
  const st = mem();
  linkGuest('p-senn', 'K7PM-4QXR', 'Senn', st);
  assert.deepEqual(claimGuests({ id: 'g1', players: ['p-bram', 'p-senn'] }, st), ['p-senn']);
  assert.deepEqual(claimGuests({ id: 'g2', players: ['p-bram', 'p-senn'] }, st), [], 'tweede training krijgt de code niet');
  releaseGuests('g1', st);
  assert.deepEqual(claimGuests({ id: 'g3', players: ['p-senn'] }, st), ['p-senn']);
});

test('na de training: alleen de gekoppelde speler in de wachtrij, met samenvatting; code daarna verbruikt', () => {
  const st = mem();
  linkGuest('p-senn', 'K7PMXQXR', 'Senn', st);
  claimGuests({ id: 'g1', players: ['p-bram', 'p-senn'] }, st);
  const bram = tr('t-bram', 'p-bram', Array.from({ length: 10 }, () => turn(['S20', 'S20', 'S20'])));
  const senn = tr('t-senn', 'p-senn', [...Array.from({ length: 9 }, () => turn(['S20', 'S5', 'S1'])), turn(['T20', 'T20', 'T20'])]);
  assert.equal(queueGuestTrainings('g1', [bram, senn], st), 1);
  const q = readGuest(st).queue;
  assert.equal(q.length, 1);
  assert.deepEqual(q[0].training, { id: 't-senn', date: '2026-10-08', darts: 30, points: 9 * 26 + 180, high: 180, tons: 1, t140: 1, t180: 1 });
  assert.equal(JSON.stringify(q).includes('S20'), false, 'geen losse pijlen');
  assert.equal(guestLink('p-senn', st).code, null);
  // nogmaals afronden met dezelfde groeps-ID levert niets dubbel op
  assert.equal(queueGuestTrainings('g1', [senn], st), 0);
  // onvolledige laatste beurt: niet doorsturen (zelfde regel als gedeelde cijfers)
  linkGuest('p-senn', 'ABCDEFGH', 'Senn', st);
  claimGuests({ id: 'g2', players: ['p-senn'] }, st);
  assert.equal(queueGuestTrainings('g2', [tr('t-kort', 'p-senn', [turn(['S20', 'S20', 'S20']), turn(['S20'])])], st), 0);
});

test('training van een andere telefoon telt mee in je gedeelde cijfers, DartCounter-samenvattingen niet', () => {
  const own = tr('eigen', 'p1', Array.from({ length: 10 }, () => turn(['S20', 'S20', 'S20'])), '2026-10-06T18:00:00Z');
  const other = summaryTraining({ playerId: 'p1', points: 1800, darts: 30, high: 180, t180: 10, date: '2026-10-08T12:00:00Z', source: OTHER_PHONE, id: 'gast-x' });
  other.summary.tons = 10; other.summary.t140 = 10;
  const dc = summaryTraining({ playerId: 'p1', points: 1300, darts: 99, high: 100, date: '2026-10-07T12:00:00Z', source: 'DartCounter', id: 'dc-1' });
  const all = publicSnapshots({ trainings: [own, other, dc] }, 'p1').find(s => s.period === 'all');
  assert.deepEqual({ darts: all.darts, points: all.points, sessions: all.sessions, hits180: all.hits180, highestTurn: all.highestTurn, best30: all.best30 },
    { darts: 60, points: 2400, sessions: 2, hits180: 10, highestTurn: 180, best30: 1800 });
});

test('samenvatting van een training komt uit de echte worpen', () => {
  const s = guestSummary(tr('t1', 'p', [turn(['T20', 'T20', 'S20']), turn(['S1', 'S1', 'S1'])]));
  assert.deepEqual(s, { id: 't1', date: '2026-10-08', darts: 6, points: 143, high: 140, tons: 1, t140: 1, t180: 0 });
});
