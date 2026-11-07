// App Store Connect: status opvragen, versie voorbereiden en indienen voor App Review (zie IOS-APP.md).
// Draait in GitHub Actions met dezelfde secrets als TestFlight (environment "testflight"); drukt nooit secrets af.
//
//   node tools/ios/asc-release.mjs status                      alleen lezen: versies, builds, leeftijd, teksten, review
//   node tools/ios/asc-release.mjs prepare <versie> <build>    versie aanmaken/bijwerken, build koppelen, teksten en
//                                                              reviewnotities uit appstore/release-<versie>.json
//   node tools/ios/asc-release.mjs submit <versie> <build>     controleert alles nog eens en dient in bij App Review
//
// Wat de API niet kan (App Privacy-labels, EU-handelaarsstatus, overeenkomsten) staat in IOS-APP.md als handwerk.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { asc, checkSecrets } from './asc-signing.mjs';

const BUNDLE_ID = process.env.BUNDLE_ID || 'nl.denckh.okkie';
const OUT = process.env.ASC_REPORT || 'asc-status.json';
const q = o => '?' + Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const all = async path => { const out = []; let next = path; while (next) { const r = await asc(next); out.push(...r.data); next = r.links?.next ? r.links.next.replace(/^https:\/\/api\.appstoreconnect\.apple\.com\/v1/, '') : null; } return out; };
const soft = async (label, fn) => { try { return await fn(); } catch (e) { return { fout: `${label}: ${String(e.message).slice(0, 300)}` }; } };

export async function findApp() {
  const r = await asc('/apps' + q({ 'filter[bundleId]': BUNDLE_ID, limit: 1 }));
  if (!r.data.length) throw new Error('App niet gevonden in App Store Connect: ' + BUNDLE_ID);
  return r.data[0];
}

async function versionDetails(v) {
  const loc = await soft('lokalisaties', () => all(`/appStoreVersions/${v.id}/appStoreVersionLocalizations`));
  const locs = Array.isArray(loc) ? await Promise.all(loc.map(async l => {
    const sets = await soft('screenshots', () => all(`/appStoreVersionLocalizations/${l.id}/appScreenshotSets`));
    const shots = Array.isArray(sets) ? await Promise.all(sets.map(async s => ({ type: s.attributes.screenshotDisplayType,
      aantal: (await soft('shots', () => all(`/appScreenshotSets/${s.id}/appScreenshots`))).length ?? '?' }))) : sets;
    const a = l.attributes;
    return { taal: a.locale, beschrijving: (a.description || '').length, trefwoorden: a.keywords, wat_is_nieuw: a.whatsNew,
      promotietekst: a.promotionalText, support: a.supportUrl, marketing: a.marketingUrl, screenshots: shots };
  })) : loc;
  const build = await soft('build', async () => (await asc(`/appStoreVersions/${v.id}/build`)).data);
  const review = await soft('reviewdetail', async () => (await asc(`/appStoreVersions/${v.id}/appStoreReviewDetail`)).data);
  const ra = review?.attributes || {};
  return { id: v.id, versie: v.attributes.versionString, status: v.attributes.appStoreState || v.attributes.appVersionState,
    vrijgave: v.attributes.releaseType, aangemaakt: v.attributes.createdDate, build: build?.attributes?.version ?? (build?.fout || null),
    review: review?.fout ? review.fout : review ? { contact: [ra.contactFirstName, ra.contactLastName].filter(Boolean).join(' '), email: !!ra.contactEmail,
      telefoon: !!ra.contactPhone, demo_account_nodig: ra.demoAccountRequired, notities: (ra.notes || '').length } : null,
    lokalisaties: locs };
}

export async function status() {
  const app = await findApp();
  const id = app.id;
  const versions = await all(`/apps/${id}/appStoreVersions` + q({ limit: 20 }));
  const builds = await asc('/builds' + q({ 'filter[app]': id, sort: '-uploadedDate', limit: 30, include: 'preReleaseVersion' }));
  const pre = Object.fromEntries((builds.included || []).filter(x => x.type === 'preReleaseVersions').map(x => [x.id, x.attributes.version]));
  const infos = await soft('appInfos', () => all(`/apps/${id}/appInfos`));
  const infoDetails = Array.isArray(infos) ? await Promise.all(infos.map(async i => {
    const age = await soft('leeftijd', async () => (await asc(`/appInfos/${i.id}/ageRatingDeclaration`)).data?.attributes);
    const locs = await soft('appInfoLocalizations', () => all(`/appInfos/${i.id}/appInfoLocalizations`));
    return { id: i.id, status: i.attributes.appStoreState || i.attributes.state, leeftijd_store: i.attributes.appStoreAgeRating,
      leeftijdsverklaring: age, talen: Array.isArray(locs) ? locs.map(l => ({ taal: l.attributes.locale, naam: l.attributes.name, ondertitel: l.attributes.subtitle,
        privacy: l.attributes.privacyPolicyUrl, privacykeuzes: l.attributes.privacyChoicesUrl })) : locs };
  })) : infos;
  const submissions = await soft('reviewSubmissions', () => all('/reviewSubmissions' + q({ 'filter[app]': id, limit: 20 })));
  const report = {
    opgevraagd: new Date().toISOString(),
    app: { id, naam: app.attributes.name, bundel: app.attributes.bundleId, taal: app.attributes.primaryLocale, inhoudsrechten: app.attributes.contentRightsDeclaration },
    versies: await Promise.all(versions.map(versionDetails)),
    builds: builds.data.map(b => ({ id: b.id, versie: pre[b.relationships?.preReleaseVersion?.data?.id] || '?', build: b.attributes.version,
      verwerking: b.attributes.processingState, doelgroep: b.attributes.buildAudienceType, verlopen: b.attributes.expired,
      verloopt: b.attributes.expirationDate, geupload: b.attributes.uploadedDate, versleuteling: b.attributes.usesNonExemptEncryption,
      min_ios: b.attributes.minOsVersion })),
    appinfo: infoDetails,
    inzendingen: Array.isArray(submissions) ? submissions.map(s => ({ id: s.id, status: s.attributes.state, ingediend: s.attributes.submittedDate, platform: s.attributes.platform })) : submissions,
    niet_via_api: ['App Privacy (privacylabels)', 'EU-handelaarsstatus (DSA)', 'Overeenkomsten en belastingen', 'Prijzen/beschikbaarheid buiten de API'],
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// ---------- Versie voorbereiden ----------
const md = () => readFileSync(new URL('../../appstore/APPSTORE-TEKSTEN.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const block = (text, title, nth = 0) => { const part = text.split('## ' + title)[1]; if (!part) return null; return [...part.matchAll(/```\n([\s\S]*?)\n```/g)][nth]?.[1] ?? null; };
// "APPSTORE-TEKSTEN.md#Beschrijving" of "...#Versie 1.10.0/nl" (eerste blok) en "/en" (tweede blok).
export function fromMd(ref, text = md()) {
  const [, title] = ref.split('#');
  const m = title.match(/^(.*)\/(nl|en)$/);
  const t = m ? block(text, m[1], m[2] === 'en' ? 1 : 0) : block(text, title);
  if (!t) throw new Error('Tekst niet gevonden: ' + ref);
  return t;
}
export function loadRelease(version, text = md()) {
  const r = JSON.parse(readFileSync(new URL(`../../appstore/release-${version}.json`, import.meta.url), 'utf8'));
  for (const l of Object.values(r.locales)) {
    for (const k of ['description', 'whatsNew', 'promotionalText', 'keywords']) if (l[k + 'From']) l[k] = fromMd(l[k + 'From'], text);
    for (const [k, max] of [['description', 4000], ['keywords', 100], ['promotionalText', 170], ['whatsNew', 4000]])
      if (!l[k] || [...l[k]].length > max) throw new Error(`${k} ontbreekt of is te lang (${l[k] ? [...l[k]].length : 0}/${max})`);
  }
  if (!r.reviewNotes || r.reviewNotes.length > 4000) throw new Error('reviewnotities ontbreken of zijn te lang');
  return r;
}
const body = (type, attributes, relationships, id) => ({ data: { type, ...(id ? { id } : {}), ...(attributes ? { attributes } : {}), ...(relationships ? { relationships } : {}) } });
const rel = (type, id) => ({ data: { type, id } });

async function findVersion(appId, version) {
  return (await all(`/apps/${appId}/appStoreVersions` + q({ 'filter[versionString]': version, 'filter[platform]': 'IOS' })))[0] || null;
}
export async function findBuild(appId, version, build) {
  const r = await asc('/builds' + q({ 'filter[app]': appId, 'filter[version]': build, 'filter[preReleaseVersion.version]': version, limit: 5 }));
  const b = r.data[0];
  if (!b) throw new Error(`Build ${version} (${build}) niet gevonden in App Store Connect.`);
  const a = b.attributes;
  if (a.processingState !== 'VALID') throw new Error(`Build ${build} is niet klaar: ${a.processingState}`);
  if (a.expired) throw new Error(`Build ${build} is verlopen.`);
  if (a.buildAudienceType && a.buildAudienceType !== 'APP_STORE_ELIGIBLE') throw new Error(`Build ${build} is alleen voor interne test (${a.buildAudienceType}).`);
  return b;
}

async function uploadScreenshots(locId, displayType, dir) {
  const { readdirSync, statSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const files = readdirSync(dir).filter(f => /\.png$/i.test(f)).sort();
  if (files.length < 3 || files.length > 10) throw new Error(`${dir}: ${files.length} screenshots (3 tot 10 nodig)`);
  let set = (await all(`/appStoreVersionLocalizations/${locId}/appScreenshotSets`)).find(x => x.attributes.screenshotDisplayType === displayType);
  if (!set) set = (await asc('/appScreenshotSets', { method: 'POST', body: body('appScreenshotSets', { screenshotDisplayType: displayType }, { appStoreVersionLocalization: rel('appStoreVersionLocalizations', locId) }) })).data;
  for (const old of await all(`/appScreenshotSets/${set.id}/appScreenshots`)) await asc(`/appScreenshots/${old.id}`, { method: 'DELETE' });
  const ids = [];
  for (const f of files) {
    const path = dir + '/' + f, buf = readFileSync(path);
    const shot = (await asc('/appScreenshots', { method: 'POST', body: body('appScreenshots', { fileName: f, fileSize: statSync(path).size }, { appScreenshotSet: rel('appScreenshotSets', set.id) }) })).data;
    for (const op of shot.attributes.uploadOperations) {
      const headers = Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value]));
      const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
      if (!r.ok) throw new Error(`upload ${f}: ${r.status}`);
    }
    await asc(`/appScreenshots/${shot.id}`, { method: 'PATCH', body: body('appScreenshots', { uploaded: true, sourceFileChecksum: createHash('md5').update(buf).digest('hex') }, null, shot.id) });
    ids.push(shot.id);
  }
  await asc(`/appScreenshotSets/${set.id}/relationships/appScreenshots`, { method: 'PATCH', body: { data: ids.map(id => ({ type: 'appScreenshots', id })) } });
  return { set: set.id, aantal: ids.length };
}

export async function prepare(version, build) {
  const rel_ = loadRelease(version);
  if (String(build) !== String(rel_.build)) throw new Error(`Build ${build} wijkt af van appstore/release-${version}.json (${rel_.build}).`);
  const app = await findApp();
  const b = await findBuild(app.id, version, build);
  let v = await findVersion(app.id, version);
  if (!v) {
    v = (await asc('/appStoreVersions', { method: 'POST', body: body('appStoreVersions', { platform: 'IOS', versionString: version, releaseType: rel_.releaseType }, { app: rel('apps', app.id) }) })).data;
    console.log(`Versie ${version} aangemaakt.`);
  }
  const state = v.attributes.appStoreState || v.attributes.appVersionState;
  if (!['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(state)) throw new Error(`Versie ${version} is niet te bewerken (status ${state}).`);
  await asc(`/appStoreVersions/${v.id}`, { method: 'PATCH', body: body('appStoreVersions', { releaseType: rel_.releaseType }, null, v.id) });
  await asc(`/appStoreVersions/${v.id}/relationships/build`, { method: 'PATCH', body: rel('builds', b.id) });
  console.log(`Build ${build} gekoppeld.`);
  const locs = await all(`/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
  const out = { versie: version, build, talen: {} };
  for (const [locale, l] of Object.entries(rel_.locales)) {
    const attrs = { description: l.description, keywords: l.keywords, promotionalText: l.promotionalText, whatsNew: l.whatsNew, supportUrl: l.supportUrl, marketingUrl: l.marketingUrl };
    let loc = locs.find(x => x.attributes.locale === locale);
    if (loc) await asc(`/appStoreVersionLocalizations/${loc.id}`, { method: 'PATCH', body: body('appStoreVersionLocalizations', attrs, null, loc.id) });
    else loc = (await asc('/appStoreVersionLocalizations', { method: 'POST', body: body('appStoreVersionLocalizations', { locale, ...attrs }, { appStoreVersion: rel('appStoreVersions', v.id) }) })).data;
    out.talen[locale] = { teksten: 'bijgewerkt', screenshots: {} };
    for (const [type, dir] of Object.entries(rel_.screenshots || {})) out.talen[locale].screenshots[type] = await uploadScreenshots(loc.id, type, dir);
    console.log(`${locale}: teksten en screenshots bijgewerkt.`);
  }
  // Reviewgegevens: notities nieuw; contactgegevens overnemen van de vorige versie als deze versie ze nog niet heeft.
  let rd = null; try { rd = (await asc(`/appStoreVersions/${v.id}/appStoreReviewDetail`)).data; } catch { rd = null; }
  if (rd) await asc(`/appStoreReviewDetails/${rd.id}`, { method: 'PATCH', body: body('appStoreReviewDetails', { notes: rel_.reviewNotes, demoAccountRequired: false }, null, rd.id) });
  else {
    const prev = (await all(`/apps/${app.id}/appStoreVersions`)).find(x => x.id !== v.id && (x.attributes.appStoreState || x.attributes.appVersionState) === 'READY_FOR_SALE');
    const p = prev ? (await asc(`/appStoreVersions/${prev.id}/appStoreReviewDetail`)).data?.attributes || {} : {};
    const contact = Object.fromEntries(['contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail'].map(k => [k, p[k]]).filter(([, x]) => x));
    await asc('/appStoreReviewDetails', { method: 'POST', body: body('appStoreReviewDetails', { ...contact, notes: rel_.reviewNotes, demoAccountRequired: false }, { appStoreVersion: rel('appStoreVersions', v.id) }) });
  }
  out.reviewnotities = rel_.reviewNotes.length;
  // Leeftijdsclassificatie (hoort bij de te bewerken appInfo van deze versie).
  const infos = await all(`/apps/${app.id}/appInfos`);
  const info = infos.find(i => (i.attributes.appStoreState || i.attributes.state) !== 'READY_FOR_SALE') || infos[0];
  const age = (await asc(`/appInfos/${info.id}/ageRatingDeclaration`)).data;
  const ageAttrs = Object.fromEntries(Object.entries(rel_.ageRating).filter(([k]) => !k.startsWith('_')));
  await asc(`/ageRatingDeclarations/${age.id}`, { method: 'PATCH', body: body('ageRatingDeclarations', ageAttrs, null, age.id) });
  out.leeftijd = ageAttrs;
  writeFileSync('asc-voorbereiden.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  return out;
}

// ---------- Indienen ----------
export async function submit(version, build) {
  const app = await findApp();
  const v = await findVersion(app.id, version);
  if (!v) throw new Error(`Versie ${version} bestaat niet; eerst voorbereiden.`);
  const d = await versionDetails(v);
  const problems = [];
  if (String(d.build) !== String(build)) problems.push(`build ${d.build} gekoppeld, verwacht ${build}`);
  if (!['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(d.status)) problems.push(`status ${d.status}`);
  for (const l of Array.isArray(d.lokalisaties) ? d.lokalisaties : []) {
    if (!l.wat_is_nieuw) problems.push(`${l.taal}: Wat is nieuw ontbreekt`);
    if (!Array.isArray(l.screenshots) || !l.screenshots.some(s => s.aantal >= 3)) problems.push(`${l.taal}: screenshots ontbreken`);
  }
  if (!d.review || !(d.review.notities > 100)) problems.push('reviewnotities ontbreken');
  if (problems.length) throw new Error('Niet ingediend: ' + problems.join('; '));
  // Een open inzending (bijv. UNRESOLVED_ISSUES na een afgekeurde build) eerst intrekken; daarna een nieuwe, schone inzending.
  for (const old of await all('/reviewSubmissions' + q({ 'filter[app]': app.id, limit: 20 }))) {
    if (['UNRESOLVED_ISSUES', 'READY_FOR_REVIEW'].includes(old.attributes.state)) {
      await asc(`/reviewSubmissions/${old.id}`, { method: 'PATCH', body: body('reviewSubmissions', { canceled: true }, null, old.id) });
      console.log(`Open inzending ${old.id} (${old.attributes.state}) ingetrokken.`);
    }
  }
  const sub = (await asc('/reviewSubmissions', { method: 'POST', body: body('reviewSubmissions', { platform: 'IOS' }, { app: rel('apps', app.id) }) })).data;
  await asc('/reviewSubmissionItems', { method: 'POST', body: body('reviewSubmissionItems', null, { reviewSubmission: rel('reviewSubmissions', sub.id), appStoreVersion: rel('appStoreVersions', v.id) }) });
  const done = (await asc(`/reviewSubmissions/${sub.id}`, { method: 'PATCH', body: body('reviewSubmissions', { submitted: true }, null, sub.id) })).data;
  const after = await findVersion(app.id, version);
  const out = { inzending: sub.id, inzendingStatus: done.attributes.state, versieStatus: after.attributes.appStoreState || after.attributes.appVersionState, versie: version, build };
  writeFileSync('asc-indienen.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  return out;
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const problems = checkSecrets();
  if (problems.length) { console.error('GitHub-secrets: ' + problems.join('; ')); process.exit(1); }
  const run = { status, prepare, submit }[cmd];
  if (!run) { console.error('Gebruik: status | prepare <versie> <build> | submit <versie> <build>'); process.exit(2); }
  if (cmd !== 'status' && !(/^\d+\.\d+\.\d+$/.test(args[0] || '') && /^\d+$/.test(args[1] || ''))) { console.error('Versie (x.y.z) en buildnummer zijn verplicht.'); process.exit(2); }
  run(...args).catch(e => { console.error(e.message); process.exit(1); });
}
