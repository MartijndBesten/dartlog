// TestFlight-ondertekening (tools/ios/asc-signing.mjs) zonder Apple: nep-API. Vooral: nooit andermans certificaat
// intrekken, secrets nooit tonen, en bij een fout halverwege het eigen certificaat toch opruimen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../tools/ios/asc-signing.mjs', import.meta.url));
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const P8 = privateKey.export({ type: 'pkcs8', format: 'pem' });
const ENV = { ASC_KEY_ID: 'ABCDE12345', ASC_ISSUER_ID: '12345678-90ab-cdef-1234-567890abcdef', ASC_KEY_P8: P8, RUN_ID: '42' };
let mod, calls, api;
const realFetch = globalThis.fetch;
before(async () => {
  Object.assign(process.env, ENV);
  mod = await import(script);
  globalThis.fetch = async (url, opt = {}) => {
    const path = url.replace('https://api.appstoreconnect.apple.com/v1', ''), method = opt.method || 'GET';
    calls.push(method + ' ' + path);
    assert.match(opt.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const r = api(method, path, opt.body ? JSON.parse(opt.body) : null);
    return new Response(r.body == null ? '' : JSON.stringify(r.body), { status: r.status || 200 });
  };
});
after(() => { globalThis.fetch = realFetch; });

test('secrets: ontbrekend of verkeerd wordt bij naam genoemd, de waarde nooit', () => {
  assert.deepEqual(mod.checkSecrets(ENV), []);
  assert.deepEqual(mod.checkSecrets({ ...ENV, ASC_KEY_P8: P8.replace(/\n/g, '\\n') }), [], 'ook als de sleutel met \\n-tekens is geplakt');
  const bad = mod.checkSecrets({ ASC_KEY_ID: 'geheim-waarde', ASC_ISSUER_ID: '', ASC_KEY_P8: 'ook-geheim' }).join(' ');
  assert.match(bad, /ASC_KEY_ID heeft niet de vorm/);
  assert.match(bad, /ASC_ISSUER_ID ontbreekt/);
  assert.match(bad, /ASC_KEY_P8 is geen geldige/);
  assert.doesNotMatch(bad, /geheim-waarde|ook-geheim/);
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  assert.match(mod.checkSecrets({ ...ENV, ASC_KEY_P8: rsa }).join(), /geen App Store Connect-sleutel/);
});

test('check-opdracht faalt zonder secrets en toont geen waarden', () => {
  let out = '';
  try { execFileSync(process.execPath, [script, 'check'], { env: { PATH: process.env.PATH, ASC_KEY_ID: 'xx-geheim' }, stdio: 'pipe' }); assert.fail('had moeten falen'); }
  catch (e) { out = String(e.stderr); }
  assert.match(out, /ASC_ISSUER_ID ontbreekt/);
  assert.doesNotMatch(out, /xx-geheim/);
});

test('mislukt het profiel na het certificaat, dan trekt cleanup alleen dát certificaat in', async () => {
  calls = [];
  const dir = mkdtempSync(join(tmpdir(), 'asc-'));
  writeFileSync(join(dir, 'csr.pem'), '-----BEGIN CERTIFICATE REQUEST-----\nQUJD\n-----END CERTIFICATE REQUEST-----\n');
  api = (m, p) => {
    if (m === 'GET' && p.startsWith('/bundleIds')) return { body: { data: [{ id: 'B1', attributes: { identifier: 'nl.denckh.okkie' } }] } };
    if (m === 'POST' && p === '/certificates') return { status: 201, body: { data: { id: 'CERT-NIEUW', attributes: { serialNumber: 'S-NIEUW', certificateContent: 'QUJD' } } } };
    if (m === 'POST' && p === '/profiles') return { status: 409, body: { errors: [{ detail: 'mislukt' }] } };
    if (m === 'GET' && p === '/certificates/CERT-NIEUW') return { body: { data: { id: 'CERT-NIEUW', attributes: { serialNumber: 'S-NIEUW' } } } };
    if (m === 'DELETE') return { status: 204 };
    throw new Error('onverwacht ' + m + ' ' + p);
  };
  await assert.rejects(() => importRun('prepare', join(dir, 'csr.pem'), dir), /409/);
  assert.ok(existsSync(join(dir, 'ids.json')), 'certificaat-ID staat vast vóór het profiel');
  await importRun('cleanup', dir);
  assert.deepEqual(calls.filter(c => c.startsWith('DELETE')), ['DELETE /certificates/CERT-NIEUW']);
});

test('cleanup weigert een certificaat met een ander serienummer en een profiel met een andere naam', async () => {
  calls = [];
  const dir = mkdtempSync(join(tmpdir(), 'asc-'));
  writeFileSync(join(dir, 'ids.json'), JSON.stringify({ certificate: 'CERT-X', serial: 'S-VAN-DEZE-RUN', profile: 'PROF-X', profileName: 'OKKIE App Store CI 1' }));
  api = (m, p) => {
    if (m === 'GET' && p === '/certificates/CERT-X') return { body: { data: { attributes: { serialNumber: 'S-VAN-DE-EIGENAAR' } } } };
    if (m === 'GET' && p === '/profiles/PROF-X') return { body: { data: { attributes: { name: 'Mijn eigen profiel' } } } };
    if (m === 'DELETE') return { status: 204 };
    throw new Error('onverwacht ' + m + ' ' + p);
  };
  const warn = console.warn; console.warn = () => {};
  try { await importRun('cleanup', dir); } finally { console.warn = warn; }
  assert.deepEqual(calls.filter(c => c.startsWith('DELETE')), [], 'niets verwijderd');
});

// De opdrachten draaien in hetzelfde proces (zelfde nep-fetch) via de geëxporteerde CLI-logica.
async function importRun(cmd, ...args) {
  const saved = process.argv;
  process.argv = [process.execPath, script, cmd, ...args];
  try { return await (await import(script + '?run=' + Math.random())).done; } finally { process.argv = saved; }
}
