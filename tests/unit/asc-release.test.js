// App Store-release (tools/ios/asc-release.mjs) tegen een nep-App Store Connect: teksten uit één bron, alleen een
// App Store-geschikte build, en indienen weigert zolang er iets ontbreekt.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
Object.assign(process.env, { ASC_KEY_ID: 'ABCDE12345', ASC_ISSUER_ID: '12345678-90ab-cdef-1234-567890abcdef', ASC_KEY_P8: privateKey.export({ type: 'pkcs8', format: 'pem' }), ASC_REPORT: '/dev/null' });
let mod, calls, api;
const realFetch = globalThis.fetch;
before(async () => {
  mod = await import('../../tools/ios/asc-release.mjs');
  globalThis.fetch = async (url, opt = {}) => {
    const path = decodeURIComponent(url.replace('https://api.appstoreconnect.apple.com/v1', '')), method = opt.method || 'GET';
    calls.push(method + ' ' + path);
    const r = api(method, path, opt.body ? JSON.parse(opt.body) : null) || { status: 404, body: { errors: [{ detail: 'nep: ' + path }] } };
    return new Response(r.body == null ? null : JSON.stringify(r.body), { status: r.status || 200 });
  };
});
after(() => { globalThis.fetch = realFetch; });
const APP = { data: [{ id: 'APP1', attributes: { name: 'OKKIE.', bundleId: 'nl.denckh.okkie' } }] };

test('releasebestand 1.10.0: Nederlandse teksten uit APPSTORE-TEKSTEN.md, lengtes binnen Apple-grenzen, build 33', () => {
  const r = mod.loadRelease('1.10.0');
  const md = readFileSync(root + '/appstore/APPSTORE-TEKSTEN.md', 'utf8');
  assert.equal(r.build, '33');
  assert.equal(r.releaseType, 'AFTER_APPROVAL');
  const nl = r.locales['nl-NL'], en = r.locales['en-US'];
  for (const t of [nl.description, nl.whatsNew, nl.keywords, nl.promotionalText]) assert.ok(md.includes(t));
  assert.match(nl.whatsNew, /OKKIE\. Club/);
  assert.match(en.whatsNew, /OKKIE\. Club/);
  assert.match(en.description, /^Please note: the app is in Dutch\./);
  assert.ok(nl.keywords.length <= 100 && en.keywords.length <= 100);
  // Reviewnotities: Club uitleggen, feed eerlijk beschrijven, Darters-leeftijdsregel juist.
  assert.match(r.reviewNotes, /Gratis een club oprichten/);
  assert.match(r.reviewNotes, /club feed only lists training summaries/);
  assert.match(r.reviewNotes, /under 16 only appear after a parent confirms/);
  assert.doesNotMatch(r.reviewNotes, /\(16\+ only\)/);
  // Leeftijd: eerlijk volgens de definities, geen lagere classificatie forceren.
  assert.deepEqual({ ...r.ageRating, _uitleg: undefined }, { _uitleg: undefined, messagingAndChat: true, socialMedia: false, userGeneratedContent: true });
});

test('alleen een App Store-geschikte, verwerkte, niet-verlopen build', async () => {
  const build = attrs => ({ data: [{ id: 'B33', attributes: { processingState: 'VALID', expired: false, buildAudienceType: 'APP_STORE_ELIGIBLE', ...attrs } }] });
  for (const [attrs, re] of [[{ buildAudienceType: 'INTERNAL_ONLY' }, /alleen voor interne test/], [{ expired: true }, /verlopen/], [{ processingState: 'PROCESSING' }, /niet klaar/]]) {
    calls = []; api = (m, p) => (p.startsWith('/builds') ? { body: build(attrs) } : null);
    await assert.rejects(() => mod.findBuild('APP1', '1.10.0', '33'), re);
  }
  calls = []; api = (m, p) => (p.startsWith('/builds') ? { body: build({}) } : null);
  assert.equal((await mod.findBuild('APP1', '1.10.0', '33')).id, 'B33');
  assert.match(calls[0], /filter\[version\]=33&filter\[preReleaseVersion\.version\]=1\.10\.0/);
});

test('indienen weigert bij ontbrekende onderdelen en dient niets in', async () => {
  calls = [];
  api = (m, p) => {
    if (p.startsWith('/apps?')) return { body: APP };
    if (p.startsWith('/apps/APP1/appStoreVersions')) return { body: { data: [{ id: 'V1', attributes: { versionString: '1.10.0', appStoreState: 'PREPARE_FOR_SUBMISSION' } }] } };
    if (p === '/appStoreVersions/V1/appStoreVersionLocalizations') return { body: { data: [{ id: 'L1', attributes: { locale: 'nl-NL', description: 'x', whatsNew: null } }] } };
    if (p === '/appStoreVersionLocalizations/L1/appScreenshotSets') return { body: { data: [] } };
    if (p === '/appStoreVersions/V1/build') return { body: { data: { attributes: { version: '31' } } } };
    if (p === '/appStoreVersions/V1/appStoreReviewDetail') return { body: { data: { attributes: { notes: '' } } } };
    return null;
  };
  await assert.rejects(() => mod.submit('1.10.0', '33'), e => /build 31 gekoppeld, verwacht 33/.test(e.message) && /Wat is nieuw ontbreekt/.test(e.message) && /screenshots ontbreken/.test(e.message) && /reviewnotities ontbreken/.test(e.message));
  assert.ok(!calls.some(c => /reviewSubmission/.test(c)), 'niets ingediend');
});

test('indienen als alles klopt: inzending maken, versie toevoegen, versturen', async () => {
  calls = [];
  let submitted = false;
  api = (m, p, b) => {
    if (p.startsWith('/apps?')) return { body: APP };
    if (p.startsWith('/apps/APP1/appStoreVersions')) return { body: { data: [{ id: 'V1', attributes: { versionString: '1.10.0', appStoreState: submitted ? 'WAITING_FOR_REVIEW' : 'INVALID_BINARY' } }] } };
    if (p === '/appStoreVersions/V1/appStoreVersionLocalizations') return { body: { data: [{ id: 'L1', attributes: { locale: 'nl-NL', whatsNew: 'Nieuw' } }] } };
    if (p === '/appStoreVersionLocalizations/L1/appScreenshotSets') return { body: { data: [{ id: 'S1', attributes: { screenshotDisplayType: 'APP_IPHONE_67' } }] } };
    if (p === '/appScreenshotSets/S1/appScreenshots') return { body: { data: [1, 2, 3, 4, 5, 6].map(i => ({ id: 'X' + i })) } };
    if (p === '/appStoreVersions/V1/build') return { body: { data: { attributes: { version: '33' } } } };
    if (p === '/appStoreVersions/V1/appStoreReviewDetail') return { body: { data: { attributes: { notes: 'n'.repeat(500), contactEmail: 'x' } } } };
    if (m === 'GET' && p.startsWith('/reviewSubmissions?')) return { body: { data: [{ id: 'R0', attributes: { state: 'UNRESOLVED_ISSUES' } }, { id: 'RX', attributes: { state: 'COMPLETE' } }] } };
    if (m === 'PATCH' && p === '/reviewSubmissions/R0') { assert.equal(b.data.attributes.canceled, true); return { body: { data: { id: 'R0', attributes: { state: 'CANCELING' } } } }; }
    if (m === 'POST' && p === '/reviewSubmissions') { assert.equal(b.data.relationships.app.data.id, 'APP1'); return { status: 201, body: { data: { id: 'R1', attributes: { state: 'READY_FOR_REVIEW' } } } }; }
    if (m === 'POST' && p === '/reviewSubmissionItems') { assert.equal(b.data.relationships.appStoreVersion.data.id, 'V1'); return { status: 201, body: { data: { id: 'I1' } } }; }
    if (m === 'PATCH' && p === '/reviewSubmissions/R1') { assert.equal(b.data.attributes.submitted, true); submitted = true; return { body: { data: { id: 'R1', attributes: { state: 'WAITING_FOR_REVIEW' } } } }; }
    return null;
  };
  const r = await mod.submit('1.10.0', '33');
  assert.deepEqual([r.inzendingStatus, r.versieStatus], ['WAITING_FOR_REVIEW', 'WAITING_FOR_REVIEW']);
  // Open inzending met problemen (zoals na ITMS-90035) eerst ingetrokken; afgeronde inzendingen blijven staan.
  assert.deepEqual(calls.filter(c => !c.startsWith('GET')), ['PATCH /reviewSubmissions/R0', 'POST /reviewSubmissions', 'POST /reviewSubmissionItems', 'PATCH /reviewSubmissions/R1']);
});
