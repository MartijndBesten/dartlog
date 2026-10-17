import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAT_OPTIONS, DEFAULTS, optionsFor, statView, setStat, resetStats, shows } from '../../js/stat-prefs.js';

test('standaardweergave: alleen het belangrijkste, en niets wordt opgeslagen zolang je niets aanpast', () => {
  const settings = { theme: 'dark' };
  const v = statView(settings, 'p1');
  assert.equal(v.custom, false);
  assert.deepEqual([...v.one], DEFAULTS.one);
  assert.deepEqual([...v.many], DEFAULTS.many);
  assert.deepEqual(settings, { theme: 'dark' }, 'lezen verandert niets');
  for (const k of ['avg', 'high', 'turns']) assert.ok(shows(v, 'one', k), 'na een training standaard: ' + k);
  for (const k of ['points', 'darts', 'low']) assert.ok(!shows(v, 'one', k), 'na een training standaard uit: ' + k);
  for (const scope of ['one', 'many']) for (const k of DEFAULTS[scope]) assert.ok(optionsFor(scope).some(o => o.key === k), scope + ': ' + k);
});

test('alle gevraagde onderdelen zijn te kiezen, met onderscheid tussen één training en meerdere', () => {
  const labels = STAT_OPTIONS.map(o => o.label);
  for (const l of ['Gemiddelde per 3 pijlen', 'Hoogste beurt', 'Laagste beurt', 'Score per beurt (grafiek)', 'Totaal gescoorde punten', 'Aantal gegooide pijlen',
    'Aantal 100+, 140+ en 180', 'Beste en slechtste training', 'Vergelijking met mijn vorige training', 'Ontwikkeling over meerdere trainingen', 'Persoonlijke records']) assert.ok(labels.includes(l), l);
  assert.ok(!optionsFor('one').some(o => ['bestWorst', 'trend'].includes(o.key)), 'over meerdere trainingen hoort niet bij één training');
  assert.ok(optionsFor('many').some(o => o.key === 'bestWorst') && optionsFor('many').some(o => o.key === 'trend'));
});

test('vinkjes per speler en per soort; andere speler houdt de standaard', () => {
  const settings = {};
  assert.ok(setStat(settings, 'p1', 'one', 'turns', false));
  assert.ok(setStat(settings, 'p1', 'one', 'low', true));
  assert.ok(setStat(settings, 'p1', 'many', 'heatmap', false));
  const a = statView(settings, 'p1'), b = statView(settings, 'p2');
  assert.equal(a.custom, true);
  assert.ok(!shows(a, 'one', 'turns') && shows(a, 'one', 'low') && !shows(a, 'many', 'heatmap'));
  assert.ok(shows(a, 'many', 'trend'), 'de rest van de andere soort blijft de standaard');
  assert.equal(b.custom, false);
  assert.ok(shows(b, 'one', 'turns') && shows(b, 'many', 'heatmap'));
  assert.deepEqual(settings.statView.p1.one, ['avg', 'high', 'low', 'tons', 'prev', 'records'], 'vaste volgorde, zonder dubbele');
  assert.deepEqual(JSON.parse(JSON.stringify(settings)), settings, 'gewone JSON: past in de bestaande opslag en back-up');
});

test('ongeldige keuzes (verkeerde soort, onbekend of vervalst) worden genegeerd', () => {
  const settings = {};
  assert.equal(setStat(settings, 'p1', 'one', 'trend', true), false, 'ontwikkeling hoort niet bij één training');
  assert.equal(setStat(settings, 'p1', 'one', 'onzin', true), false);
  assert.equal(setStat(settings, 'p1', 'x', 'avg', true), false);
  assert.equal(setStat(settings, '', 'one', 'avg', true), false);
  assert.equal(settings.statView, undefined);
  const forged = { statView: { p1: { one: ['avg', '<script>', 'trend', 'avg', 7], many: 'alles' }, p2: 'kapot' } };
  const v = statView(forged, 'p1');
  assert.deepEqual([...v.one], ['avg'], 'alleen geldige sleutels');
  assert.deepEqual([...v.many], DEFAULTS.many, 'geen lijst: standaard');
  assert.equal(statView(forged, 'p2').custom, false);
  assert.equal(statView(null, 'p1').custom, false);
  assert.equal(statView({ statView: [] }, 'p1').custom, false);
});

test('alles uitzetten mag; standaardweergave herstellen haalt alleen de eigen keuzes van die speler weg', () => {
  const settings = { theme: 'light' };
  for (const o of STAT_OPTIONS.filter(o => o.scopes.includes('one'))) setStat(settings, 'p1', 'one', o.key, false);
  assert.equal(statView(settings, 'p1').one.size, 0);
  setStat(settings, 'p2', 'many', 'badges', false);
  assert.ok(resetStats(settings, 'p1'));
  assert.equal(statView(settings, 'p1').custom, false);
  assert.equal(statView(settings, 'p2').custom, true, 'andere speler houdt zijn keuze');
  assert.ok(resetStats(settings, 'p2'));
  assert.deepEqual(settings, { theme: 'light' }, 'leeg: helemaal weg');
  assert.equal(resetStats(settings, 'p2'), false);
});
