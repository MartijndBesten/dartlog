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

test('overzicht: per dag, totalen, vandaag, deze week en versies', async () => {
  const env = env0();
  for (let i = 0; i < 3; i++) await ping(env, { version: '1.7.2', first: i === 0 });
  await ping(env, { version: '1.7.1' });
  env.DB.raw.prepare("INSERT INTO usage_days(day, version, opens, new_devices) VALUES(date('now','-40 days'), '1.6.4', 9, 9)").run();
  const o = plain(await usageOverview(env));
  assert.deepEqual(o.days, [{ day: today, opens: 4, newDevices: 1 }], 'laatste 30 dagen');
  assert.deepEqual(o.totals, { devices: 10, opens: 13, since: new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10) });
  assert.equal(o.today, 4);
  assert.deepEqual(o.week, { opens: 4, newDevices: 1 });
  assert.deepEqual(o.versions, [{ version: '1.7.2', opens: 3 }, { version: '1.7.1', opens: 1 }]);
});
