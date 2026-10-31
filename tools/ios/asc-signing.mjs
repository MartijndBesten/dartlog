// Ondertekening voor TestFlight in GitHub Actions, alleen met een App Store Connect API-sleutel (zie IOS-APP.md).
// Geen Mac, geen geregistreerd toestel en geen certificaatbestanden in de repository nodig.
//
//   node tools/ios/asc-signing.mjs prepare <csr.pem> <uitmap>   bundle-ID (maken als die ontbreekt), tijdelijk
//                                                               Apple Distribution-certificaat en App Store-profiel
//   node tools/ios/asc-signing.mjs check                        secrets aanwezig en geldig (drukt niets ervan af)
//   node tools/ios/asc-signing.mjs app                          controleert of de app in App Store Connect bestaat
//   node tools/ios/asc-signing.mjs cleanup <uitmap>             profiel verwijderen, certificaat intrekken
//
// Het certificaat wordt na de upload weer ingetrokken: een account mag maar een paar distributiecertificaten hebben.
// Alleen het certificaat dat deze run zelf maakte (ID én serienummer moeten kloppen) en alleen een profiel met de
// naam "OKKIE App Store CI …". Bestaande certificaten en profielen van de eigenaar worden nooit aangeraakt.
// Builds in TestFlight en de App Store blijven werken (Apple ondertekent die zelf opnieuw).
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

async function asc(path, { method = 'GET', body } = {}) {
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
  // Meteen vastleggen: mislukt hierna iets, dan ruimt cleanup dit certificaat (en alleen dit) toch op.
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

async function cleanup(out) {
  let ids; try { ids = JSON.parse(readFileSync(join(out, 'ids.json'), 'utf8')); } catch { return console.log('Niets op te ruimen.'); }
  if (ids.profile) {
    try {
      const p = (await asc(`/profiles/${ids.profile}`)).data;
      if (!p.attributes.name.startsWith(PROFILE_PREFIX)) throw new Error('naam klopt niet, niet verwijderd');
      await asc(`/profiles/${ids.profile}`, { method: 'DELETE' }); console.log('Tijdelijk profiel verwijderd.');
    } catch (e) { console.warn(`Profiel niet opgeruimd: ${e.message}`); }
  }
  if (ids.certificate) {
    try {
      const c = (await asc(`/certificates/${ids.certificate}`)).data;
      if (!ids.serial || c.attributes.serialNumber !== ids.serial) throw new Error('serienummer klopt niet, niet ingetrokken');
      await asc(`/certificates/${ids.certificate}`, { method: 'DELETE' }); console.log('Tijdelijk certificaat van deze run ingetrokken.');
    } catch (e) { console.warn(`Certificaat niet opgeruimd: ${e.message}`); }
  }
}

// Als opdracht (node tools/ios/asc-signing.mjs …) of in de tests (done = de lopende opdracht).
const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const check = async () => { const p = checkSecrets(); if (p.length) throw new Error('GitHub-secrets: ' + p.join('; ') + '. Zie IOS-APP.md, TestFlight.'); console.log('Secrets aanwezig en geldig van vorm.'); };
const run = cmd ? { check, prepare: () => prepare(args[0], args[1]), app, cleanup: () => cleanup(args[0]) }[cmd] : null;
export const done = run ? run() : Promise.resolve();
if (isMain) {
  if (cmd && !run) { console.error('Gebruik: check | prepare <csr> <map> | app | cleanup <map>'); process.exit(2); }
  done.catch(e => { console.error(e.message); process.exit(1); });
}
