// iPhone-app (Capacitor): de webview heeft origin capacitor://localhost. Die moet in productie (en lokaal) mogen,
// anders werken Darters, Hulp & feedback en de dagteller niet in de app. Zie IOS-APP.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';

const APP = 'capacitor://localhost';
const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const origins = [...toml.matchAll(/^ALLOWED_ORIGINS = "([^"]+)"/gm)].map(m => m[1]);

test('wrangler.toml: de iPhone-app staat in beide omgevingen tussen de toegestane origins', () => {
  assert.equal(origins.length, 2);
  for (const o of origins) {
    assert.ok(o.split(',').includes(APP), o);
    assert.ok(o.split(',').includes('https://app.okkiedarts.nl'), 'de PWA blijft gewoon werken');
  }
});

test('vanuit de app: CORS-antwoord en schrijven toegestaan; een onbekende capacitor-origin niet', async () => {
  const env = { DB: createD1(), ALLOWED_ORIGINS: origins[1], DARTERS_ENABLED: 'true', GROUPS_ENABLED: 'false', REGISTRATION_ENABLED: 'false' };
  const call = (origin, method = 'POST') => worker.fetch(new Request('https://api.example/v1/darters/join', {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.9.' + Math.floor(Math.random() * 250) },
    body: method === 'POST' ? JSON.stringify({ nickname: 'Senn', age: 'adult' }) : undefined,
  }), env);
  const pre = await call(APP, 'OPTIONS');
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), APP);
  const ok = await call(APP);
  assert.equal(ok.status, 201, await ok.clone().text());
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), APP);
  assert.equal((await call('capacitor://andere-app')).status, 403);
});
