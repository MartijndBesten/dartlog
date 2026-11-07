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

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const problems = checkSecrets();
  if (problems.length) { console.error('GitHub-secrets: ' + problems.join('; ')); process.exit(1); }
  const run = { status }[cmd];
  if (!run) { console.error('Gebruik: status'); process.exit(2); }
  run(...args).catch(e => { console.error(e.message); process.exit(1); });
}
