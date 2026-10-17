// Anonieme dagteller: één seintje per toestel per dag, alleen aantallen per dag en versie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { usageOverview } from '../src/usage.js';
import { createD1 } from './d1-shim.js';

const ORIGIN = 'https://app.okkiedarts.nl';
const env0 = () => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, DARTERS_ENABLED: 'true' });
const ping = (env, body, { origin = ORIGIN, method = 'POST', raw } = {}) => worker.fetch(new Request('https://api.example/v1/ping', {
  method, headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '10.4.0.1' }, body: method === 'GET' ? undefined : raw ?? JSON.stringify(body) }), env);
const plain = x => JSON.parse(JSON.stringify(x));   // node:sqlite geeft objecten zonder prototype
const rows = env => plain(env.DB.raw.prepare('SELECT day, version, opens, new_devices FROM usage_days ORDER BY version').all());
const today = new Date().toISOString().slice(0, 10);

test('telt per dag en versie: openingen en nieuwe toestellen, zonder iets per toestel te bewaren', async () => {
  const env = env0();
  assert.equal((await ping(env, { version: '1.7.2', first: true })).status, 200);
  assert.equal((await ping(env, { version: '1.7.2', first: false })).status, 200);
  assert.equal((await ping(env, { version: '1.7.2', first: 'ja' })).status, 200, 'first moet exact true zijn');
  assert.equal((await ping(env, { version: '1.7.1' })).status, 200);
  assert.deepEqual(rows(env), [
    { day: today, version: '1.7.1', opens: 1, new_devices: 0 },
    { day: today, version: '1.7.2', opens: 3, new_devices: 1 },
  ]);
  const cols = env.DB.raw.prepare('PRAGMA table_info(usage_days)').all().map(c => c.name);
  assert.deepEqual(cols, ['day', 'version', 'opens', 'new_devices'], 'geen kolom voor IP, ID of tijdstip');
});

test('rare invoer: vreemde versie wordt "onbekend"; ongeldig JSON, verkeerde herkomst of GET tellen niet', async () => {
  const env = env0();
  assert.equal((await ping(env, { version: '<script>', first: true })).status, 200);
  assert.equal((await ping(env, { version: 'x'.repeat(500) })).status, 200);
  assert.equal((await ping(env, [1, 2])).status, 400);
  assert.equal((await ping(env, null, { raw: '{nee' })).status, 400);
  assert.equal((await ping(env, { version: '1.7.2' }, { origin: 'https://evil.example' })).status, 403);
  assert.notEqual((await ping(env, { version: '1.7.2' }, { method: 'GET' })).status, 200);
  assert.deepEqual(rows(env), [{ day: today, version: 'onbekend', opens: 2, new_devices: 1 }]);
});

test('over de minuutlimiet: antwoord blijft ok (de app probeert het pas morgen weer), maar er wordt niets geteld', async () => {
  const env = { ...env0(), RL_WRITE: { limit: async () => ({ success: false }) } };
  assert.equal((await ping(env, { version: '1.7.2', first: true })).status, 200);
  assert.deepEqual(rows(env), []);
});

test('overzicht: vandaag, 7 en 30 dagen, totalen, per dag en per versie; meldingen en nieuwe toestellen apart', async () => {
  const env = env0();
  for (let i = 0; i < 3; i++) await ping(env, { version: '1.7.2', first: i === 0 });
  await ping(env, { version: '1.7.1' });
  env.DB.raw.prepare("INSERT INTO usage_days(day, version, opens, new_devices) VALUES(date('now','-10 days'), '1.7.1', 5, 2), (date('now','-40 days'), '1.6.4', 9, 9)").run();
  const o = plain(await usageOverview(env));
  assert.equal(o.day, today);
  assert.deepEqual(o.today, { opens: 4, newDevices: 1 });
  assert.deepEqual(o.week, { opens: 4, newDevices: 1, activeDays: 1 });
  assert.deepEqual(o.month, { opens: 9, newDevices: 3, activeDays: 2 });
  assert.deepEqual(o.totals, { devices: 12, opens: 18, since: new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10), activeDays: 3 });
  assert.deepEqual(o.days.map(d => d.opens), [5, 4], 'laatste 30 dagen, op volgorde');
  assert.deepEqual(o.versions7, [{ version: '1.7.2', opens: 3, newDevices: 1 }, { version: '1.7.1', opens: 1, newDevices: 0 }]);
  assert.deepEqual(o.versions30, [{ version: '1.7.1', opens: 6, newDevices: 2 }, { version: '1.7.2', opens: 3, newDevices: 1 }]);
  assert.ok(o.notes.some(n => /geen unieke personen/.test(n)) && o.notes.some(n => /indicatief/.test(n)), 'uitleg over wat de cijfers niet zijn');
});

test('beheer: het gebruik staat in de besloten inbox (alleen met sleutel) en in het Access-overzicht', async () => {
  const KEY = 'k'.repeat(40);
  const env = { ...env0(), FEEDBACK_KEY: KEY };
  await ping(env, { version: '1.7.2', first: true });
  const get = (key, p = '/v1/feedback/admin/usage') => worker.fetch(new Request('https://api.example' + p, { headers: key ? { Authorization: 'Bearer ' + key } : {} }), env);
  assert.equal((await get(null)).status, 403);
  assert.equal((await get('x'.repeat(40))).status, 403);
  const r = await get(KEY);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'no-store, private');
  const { usage } = await r.json();
  assert.deepEqual(usage.today, { opens: 1, newDevices: 1 });
  const page = await worker.fetch(new Request('https://api.example/v1/feedback/inbox'), env);
  const html = await page.text();
  for (const t of ['Gebruik van de app', 'Meldingen per dag', 'Per appversie', 'geen unieke personen', '/v1/feedback/admin/usage']) assert.ok(html.includes(t), t);
  assert.equal((await worker.fetch(new Request('https://api.example/v1/feedback/admin/usage', { headers: { Authorization: 'Bearer ' + KEY } }), { ...env, FEEDBACK_KEY: undefined })).status, 404, 'zonder sleutel bestaat de inbox niet');
});

test('manipulatie: te groot, extra velden, first als tekst, dubbel in één dag; nooit meer dan aantallen', async () => {
  const env = env0();
  assert.equal((await ping(env, null, { raw: '{"version":"1.7.2","x":"' + 'y'.repeat(60000) + '"}' })).status, 400, 'te groot');
  assert.equal((await ping(env, { version: '1.7.2', first: true, id: 'abc', name: 'Sem', scores: [180] })).status, 200);
  assert.equal((await ping(env, { version: '1.7.2', first: 'true' })).status, 200);
  assert.deepEqual(rows(env), [{ day: today, version: '1.7.2', opens: 2, new_devices: 1 }], 'extra velden en "first" als tekst tellen niet');
  // Dubbel melden kan de server niet herkennen (geen ID); dat staat als beperking in de uitleg.
  await ping(env, { version: '1.7.2', first: true });
  assert.deepEqual(rows(env), [{ day: today, version: '1.7.2', opens: 3, new_devices: 2 }]);
});
