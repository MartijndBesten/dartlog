// Ondertekening voor TestFlight in GitHub Actions, alleen met een App Store Connect API-sleutel (zie IOS-APP.md).
// Geen Mac, geen geregistreerd toestel en geen certificaatbestanden in de repository nodig.
//
//   node tools/ios/asc-signing.mjs prepare <csr.pem> <uitmap>   bundle-ID (maken als die ontbreekt), tijdelijk
//                                                               Apple Distribution-certificaat en App Store-profiel
//   node tools/ios/asc-signing.mjs check                        secrets aanwezig en geldig (drukt niets ervan af)
//   node tools/ios/asc-signing.mjs app                          controleert of de app in App Store Connect bestaat
//   node tools/ios/asc-signing.mjs cleanup <uitmap>             meldt alleen: certificaat en profiel blijven geldig
//   node tools/ios/asc-signing.mjs retire                       oude CI-certificaten intrekken (nooit als er een versie bij Apple ligt)
//
// Het certificaat blijft na de upload geldig (zie cleanup). `retire` trekt alleen oude CI-certificaten in, alleen via
// profielen met de naam "OKKIE App Store CI …", nooit het nieuwste en nooit als er een versie bij Apple ligt.
// Certificaten en profielen van de eigenaar zelf worden nooit aangeraakt.
// Omgeving: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (inhoud van AuthKey_XXXX.p8), BUNDLE_ID, optioneel RUN_ID.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://api.appstoreconnect.apple.com/v1';
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, BUNDLE_ID = 'nl.denckh.okkie', RUN_ID = String(Date.now()) } = process.env;
const PROFILE_PREFIX = 'OKKIE App Store CI ';
const b64url = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

export function jwt({ keyId, issuer, p8, now = Math.floor(Date.now() / 1000) }) {
  const head = b64url({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = b64url({ iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const sig = sign('sha256', Buffer.from(head + '.' + body), { key: createPrivateKey(p8), dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + sig.toString('base64url');
}

export async function asc(path, { method = 'GET', body } = {}) {
  const token = jwt({ keyId: ASC_KEY_ID.trim(), issuer: ASC_ISSUER_ID.trim(), p8: ASC_KEY_P8.replace(/\\n/g, '\n') });
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
}

async function bundleId() {
  const found = await asc(`/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_ID)}&limit=5`);
  const hit = found.data.find(b => b.attributes.identifier === BUNDLE_ID);
  if (hit) return hit.id;
  console.log('Bundle-ID bestaat nog niet, aanmaken:', BUNDLE_ID);
  return (await asc('/bundleIds', { method: 'POST', body: { data: { type: 'bundleIds', attributes: { identifier: BUNDLE_ID, name: 'OKKIE', platform: 'IOS' } } } })).data.id;
}

// Controle vooraf: welke secrets ontbreken of kloppen niet. Noemt alleen namen, nooit waarden.
export function checkSecrets(env = process.env) {
  const problems = [];
  if (!env.ASC_KEY_ID) problems.push('ASC_KEY_ID ontbreekt');
  else if (!/^[A-Z0-9]{8,12}$/.test(env.ASC_KEY_ID.trim())) problems.push('ASC_KEY_ID heeft niet de vorm van een Key ID (10 hoofdletters/cijfers)');
  if (!env.ASC_ISSUER_ID) problems.push('ASC_ISSUER_ID ontbreekt');
  else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ASC_ISSUER_ID.trim())) problems.push('ASC_ISSUER_ID is geen Issuer ID (UUID)');
  if (!env.ASC_KEY_P8) problems.push('ASC_KEY_P8 ontbreekt');
  else {
    try { const k = createPrivateKey(env.ASC_KEY_P8.replace(/\\n/g, '\n')); if (k.asymmetricKeyType !== 'ec') problems.push('ASC_KEY_P8 is geen App Store Connect-sleutel (EC)'); }
    catch { problems.push('ASC_KEY_P8 is geen geldige .p8-sleutel (plak de hele inhoud, met BEGIN/END-regels)'); }
  }
  return problems;
}

async function prepare(csrFile, out) {
  const problems = checkSecrets();
  if (problems.length) throw new Error('GitHub-secrets: ' + problems.join('; '));
  mkdirSync(out, { recursive: true });
  const bid = await bundleId();
  const csrContent = readFileSync(csrFile, 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const cert = (await asc('/certificates', { method: 'POST', body: { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent } } } })).data;
  // Meteen vastleggen welk certificaat deze run maakte (voor het verslag en voor retire).
  const ids = { certificate: cert.id, serial: cert.attributes.serialNumber, bundle: bid };
  writeFileSync(join(out, 'ids.json'), JSON.stringify(ids));
  writeFileSync(join(out, 'distribution.cer'), Buffer.from(cert.attributes.certificateContent, 'base64'));
  const name = PROFILE_PREFIX + RUN_ID;
  const profile = (await asc('/profiles', { method: 'POST', body: { data: { type: 'profiles', attributes: { name, profileType: 'IOS_APP_STORE' },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bid } }, certificates: { data: [{ type: 'certificates', id: cert.id }] } } } } })).data;
  writeFileSync(join(out, 'profile.mobileprovision'), Buffer.from(profile.attributes.profileContent, 'base64'));
  writeFileSync(join(out, 'ids.json'), JSON.stringify({ ...ids, profile: profile.id, profileName: name }));
  console.log(`Tijdelijk certificaat ${cert.id} en profiel "${name}" klaar.`);
}

async function app() {
  const r = await asc(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
  if (!r.data.length) throw new Error(`Er is nog geen app met bundle-ID ${BUNDLE_ID} in App Store Connect. Maak die eerst aan (IOS-APP.md, stap 2).`);
  console.log(`App Store Connect: "${r.data[0].attributes.name}" (${r.data[0].id}) gevonden.`);
}

// Na de upload NIETS intrekken of verwijderen. Apple controleert de handtekening opnieuw bij het indienen voor review;
// een ingetrokken certificaat geeft dan ITMS-90035 "Invalid Signature" (gebeurd met build 33, 7 november 2026).
// Het certificaat en profiel van deze run blijven dus geldig. Oude CI-certificaten ruimt `retire` op, veilig.
async function cleanup(out) {
  let ids; try { ids = JSON.parse(readFileSync(join(out, 'ids.json'), 'utf8')); } catch { return console.log('Niets te melden.'); }
  console.log(`Certificaat ${ids.certificate || '?'} en profiel "${ids.profileName || '?'}" blijven geldig (nodig tot de build door App Review is). Opruimen later met: asc-signing.mjs retire`);
}

// Oude CI-certificaten intrekken (alleen die via een profiel "OKKIE App Store CI …" aan CI hangen), behalve het nieuwste.
// Weigert zolang er een versie bij Apple ligt of klaarstaat met een gekoppelde build: dan kan een oud certificaat nog nodig zijn.
const BUSY = ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE', 'PROCESSING_FOR_APP_STORE', 'ACCEPTED', 'INVALID_BINARY', 'WAITING_FOR_EXPORT_COMPLIANCE'];
export async function retire() {
  const apps = (await asc(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`)).data;
  if (!apps.length) throw new Error('App niet gevonden.');
  const versions = (await asc(`/apps/${apps[0].id}/appStoreVersions?limit=20`)).data;
  for (const v of versions) {
    const st = v.attributes.appStoreState || v.attributes.appVersionState;
    if (BUSY.includes(st)) throw new Error(`Niet opgeruimd: versie ${v.attributes.versionString} heeft status ${st}.`);
    if (st === 'PREPARE_FOR_SUBMISSION' || /REJECTED/.test(st)) {
      const b = await asc(`/appStoreVersions/${v.id}/build`).catch(() => null);
      if (b?.data) throw new Error(`Niet opgeruimd: versie ${v.attributes.versionString} heeft build ${b.data.attributes?.version} gekoppeld en is nog niet live.`);
    }
  }
  const profiles = (await asc('/profiles?filter[profileType]=IOS_APP_STORE&limit=200')).data
    .filter(p => p.attributes.name.startsWith(PROFILE_PREFIX))
    .sort((a, b) => String(b.attributes.createdDate || b.attributes.name).localeCompare(String(a.attributes.createdDate || a.attributes.name), undefined, { numeric: true }));
  const keep = profiles[0];
  const keepCerts = new Set(keep ? (await asc(`/profiles/${keep.id}/certificates`)).data.map(c => c.id) : []);
  let n = 0;
  for (const p of profiles.slice(1)) {
    for (const c of (await asc(`/profiles/${p.id}/certificates`)).data) {
      if (keepCerts.has(c.id)) continue;
      await asc(`/certificates/${c.id}`, { method: 'DELETE' }); n++;
    }
    await asc(`/profiles/${p.id}`, { method: 'DELETE' });
  }
  console.log(`Opgeruimd: ${n} oude CI-certificaten, ${Math.max(0, profiles.length - 1)} profielen. Bewaard: ${keep ? keep.attributes.name : 'geen'}.`);
  return { revoked: n };
}

// Als opdracht (node tools/ios/asc-signing.mjs …) of in de tests (done = de lopende opdracht).
// Alleen als opdracht (node tools/ios/asc-signing.mjs …). Bij importeren (asc-release.mjs, tests) gebeurt niets vanzelf:
// beide scripts kennen een "prepare", en een import mag nooit een certificaat aanvragen.
const check = async () => { const p = checkSecrets(); if (p.length) throw new Error('GitHub-secrets: ' + p.join('; ') + '. Zie IOS-APP.md, TestFlight.'); console.log('Secrets aanwezig en geldig van vorm.'); };
export function cli(argv) {
  const [cmd, ...args] = argv;
  const run = { check, prepare: () => prepare(args[0], args[1]), app, cleanup: () => cleanup(args[0]), retire }[cmd];
  if (!run) throw new Error('Gebruik: check | prepare <csr> <map> | app | cleanup <map> | retire');
  return run();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(/Gebruik/.test(e.message) ? 2 : 1); });
}
