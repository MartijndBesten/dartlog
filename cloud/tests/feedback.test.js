// Hulp & feedback: insturen vanuit de app, spamwering, en de besloten inbox. Fictieve meldingen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';

const ORIGIN = 'https://app.okkiedarts.nl';
const KEY = 'k'.repeat(40);
const env0 = (extra = {}) => ({ DB: createD1(), ALLOWED_ORIGINS: ORIGIN, DARTERS_ENABLED: 'true', FEEDBACK_KEY: KEY, ...extra });
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async u => { throw new Error('Onverwachte externe aanroep: ' + u); }; });
after(() => { globalThis.fetch = realFetch; });
const send = (env, body, { origin = ORIGIN, ip = '10.2.0.1' } = {}) => worker.fetch(new Request('https://api.example/v1/feedback', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env);
const admin = (env, path, { method = 'GET', key = KEY, body, origin } = {}) => worker.fetch(new Request('https://api.example' + path, {
  method, headers: { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
  body: body ? JSON.stringify(body) : undefined }), env);
const good = { kind: 'probleem', message: 'De knop Bewaren reageert niet na een training.', elapsed: 9000,
  meta: { version: '1.6.0', device: 'iPhone · iOS 18', display: '393×852', lang: 'nl-NL', installed: true, errors: ['TypeError: x is undefined (app.js:12)'], token: 'geheim' } };

test('melding komt binnen met alleen de toegestane technische gegevens', async () => {
  const env = env0();
  const r = await send(env, { ...good, contact: 'sem@example.nl', screenshot: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' });
  assert.equal(r.status, 201, await r.clone().text());
  const row = env.DB.raw.prepare('SELECT * FROM feedback').get();
  assert.equal(row.kind, 'probleem');
  assert.equal(row.contact, 'sem@example.nl');
  const meta = JSON.parse(row.meta);
  assert.equal(meta.version, '1.6.0');
  assert.equal(meta.token, undefined, 'onbekende velden (zoals tokens) worden niet bewaard');
  assert.ok(row.screenshot.startsWith('data:image/jpeg;base64,'));
});

test('spamwering: verkeerde herkomst, honeypot, te snel, te kort, geen afbeelding, daglimiet', async () => {
  const env = env0();
  assert.equal((await send(env, good, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(env, { ...good, website: 'http://spam' })).status, 201, 'honeypot: lijkt gelukt');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback').get().n, 0, 'maar niets bewaard');
  assert.equal((await send(env, { ...good, elapsed: 300 })).status, 400);
  assert.equal((await send(env, { ...good, message: 'hoi' })).status, 400);
  assert.equal((await send(env, { ...good, message: 'x'.repeat(2001) })).status, 400);
  assert.equal((await send(env, { ...good, screenshot: 'data:text/html;base64,PHNjcmlwdD4=' })).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await send(env, good, { ip: '10.9.9.9' })).status, 201);
  assert.equal((await send(env, good, { ip: '10.9.9.9' })).status, 429, 'daglimiet per adres');
  assert.equal((await send(env, good, { ip: '10.9.9.10' })).status, 201, 'ander adres gaat gewoon door');
});

test('inbox: alleen met de sleutel, wijzigen alleen vanaf de inbox zelf; zonder sleutel bestaat hij niet', async () => {
  const env = env0();
  await send(env, good);
  assert.equal((await admin(env0({ FEEDBACK_KEY: undefined }), '/v1/feedback/inbox')).status, 404);
  assert.equal((await admin(env, '/v1/feedback/inbox')).status, 200);
  assert.equal((await admin(env, '/v1/feedback/admin/list', { key: 'x'.repeat(40) })).status, 403);
  const { items } = await (await admin(env, '/v1/feedback/admin/list')).json();
  assert.equal(items.length, 1);
  assert.equal(items[0].message, good.message);
  assert.equal(items[0].ip_day_hash, undefined);
  assert.equal((await admin(env, '/v1/feedback/admin/delete', { method: 'POST', body: { id: items[0].id }, origin: ORIGIN })).status, 404, 'niet vanaf een andere pagina');
  assert.equal((await admin(env, '/v1/feedback/admin/delete', { method: 'POST', body: { id: items[0].id }, origin: 'https://api.example' })).status, 200);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback').get().n, 0);
});

test('opschoning wist meldingen ouder dan 180 dagen', async () => {
  const env = env0();
  await send(env, good);
  env.DB.raw.exec("UPDATE feedback SET created_at = datetime('now', '-181 days')");
  await send(env, good, { ip: '10.3.3.3' });
  await worker.scheduled({}, env);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM feedback').get().n, 1);
});
