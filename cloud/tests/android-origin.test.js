// Android-app (Capacitor, androidScheme https): de webview heeft origin https://localhost. Die staat klaar in beide
// omgevingen; in productie werkt hij pas na de eerstvolgende Worker-deploy (bij de livegang van de Android-app,
// zie ANDROID-APP.md). Andere localhost-varianten blijven geweigerd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';
import { createD1 } from './d1-shim.js';

const APP = 'https://localhost';
const origins = [...readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8').matchAll(/^ALLOWED_ORIGINS = "([^"]+)"/gm)].map(m => m[1]);

test('wrangler.toml: de Android-app staat in beide omgevingen tussen de toegestane origins', () => {
  assert.equal(origins.length, 2);
  for (const o of origins) assert.ok(o.split(',').includes(APP), o);
});

test('vanuit de Android-app: CORS en schrijven toegestaan; https://localhost:8443 of http://localhost niet', async () => {
  const env = { DB: createD1(), ALLOWED_ORIGINS: origins[1], DARTERS_ENABLED: 'true', GROUPS_ENABLED: 'false', REGISTRATION_ENABLED: 'false' };
  const call = (origin, method = 'POST') => worker.fetch(new Request('https://api.example/v1/darters/join', {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.8.8.' + Math.floor(Math.random() * 250) },
    body: method === 'POST' ? JSON.stringify({ nickname: 'Anouk', age: 'adult' }) : undefined,
  }), env);
  const pre = await call(APP, 'OPTIONS');
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), APP);
  const ok = await call(APP);
  assert.equal(ok.status, 201, await ok.clone().text());
  for (const bad of ['https://localhost:8443', 'http://localhost']) assert.equal((await call(bad)).status, 403, bad);
});
