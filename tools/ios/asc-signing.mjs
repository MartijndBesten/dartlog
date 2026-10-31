// Ondertekening voor TestFlight in GitHub Actions, alleen met een App Store Connect API-sleutel (zie IOS-APP.md).
// Geen Mac, geen geregistreerd toestel en geen certificaatbestanden in de repository nodig.
//
//   node tools/ios/asc-signing.mjs prepare <csr.pem> <uitmap>   bundle-ID (maken als die ontbreekt), tijdelijk
//                                                               Apple Distribution-certificaat en App Store-profiel
//   node tools/ios/asc-signing.mjs app                          controleert of de app in App Store Connect bestaat
//   node tools/ios/asc-signing.mjs cleanup <uitmap>             profiel verwijderen, certificaat intrekken
//
// Het certificaat wordt na de upload weer ingetrokken: een account mag maar een paar distributiecertificaten hebben.
// Builds in TestFlight en de App Store blijven werken (Apple ondertekent die zelf opnieuw).
// Omgeving: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (inhoud van AuthKey_XXXX.p8), BUNDLE_ID, optioneel RUN_ID.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com/v1';
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, BUNDLE_ID = 'nl.denckh.okkie', RUN_ID = String(Date.now()) } = process.env;
const b64url = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

export function jwt({ keyId, issuer, p8, now = Math.floor(Date.now() / 1000) }) {
  const head = b64url({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = b64url({ iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const sig = sign('sha256', Buffer.from(head + '.' + body), { key: createPrivateKey(p8), dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + sig.toString('base64url');
}

async function asc(path, { method = 'GET', body } = {}) {
  const token = jwt({ keyId: ASC_KEY_ID, issuer: ASC_ISSUER_ID, p8: ASC_KEY_P8.replace(/\\n/g, '\n') });
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

async function prepare(csrFile, out) {
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8) throw new Error('ASC_KEY_ID, ASC_ISSUER_ID en ASC_KEY_P8 ontbreken (GitHub-secrets).');
  mkdirSync(out, { recursive: true });
  const bid = await bundleId();
  const csrContent = readFileSync(csrFile, 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const cert = (await asc('/certificates', { method: 'POST', body: { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent } } } })).data;
  writeFileSync(join(out, 'distribution.cer'), Buffer.from(cert.attributes.certificateContent, 'base64'));
  const name = `OKKIE App Store CI ${RUN_ID}`;
  const profile = (await asc('/profiles', { method: 'POST', body: { data: { type: 'profiles', attributes: { name, profileType: 'IOS_APP_STORE' },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bid } }, certificates: { data: [{ type: 'certificates', id: cert.id }] } } } } })).data;
  writeFileSync(join(out, 'profile.mobileprovision'), Buffer.from(profile.attributes.profileContent, 'base64'));
  writeFileSync(join(out, 'ids.json'), JSON.stringify({ certificate: cert.id, profile: profile.id, profileName: name, bundle: bid }));
  console.log(`Tijdelijk certificaat ${cert.id} en profiel "${name}" klaar.`);
}

async function app() {
  const r = await asc(`/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
  if (!r.data.length) throw new Error(`Er is nog geen app met bundle-ID ${BUNDLE_ID} in App Store Connect. Maak die eerst aan (IOS-APP.md, stap 2).`);
  console.log(`App Store Connect: "${r.data[0].attributes.name}" (${r.data[0].id}) gevonden.`);
}

async function cleanup(out) {
  let ids; try { ids = JSON.parse(readFileSync(join(out, 'ids.json'), 'utf8')); } catch { return console.log('Niets op te ruimen.'); }
  for (const [kind, id] of [['profiles', ids.profile], ['certificates', ids.certificate]]) {
    try { await asc(`/${kind}/${id}`, { method: 'DELETE' }); console.log(`Opgeruimd: ${kind} ${id}`); }
    catch (e) { console.warn(`Opruimen ${kind} ${id} mislukt: ${e.message}`); }
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd) {
  const run = { prepare: () => prepare(args[0], args[1]), app, cleanup: () => cleanup(args[0]) }[cmd];
  if (!run) { console.error('Gebruik: prepare <csr> <map> | app | cleanup <map>'); process.exit(2); }
  run().catch(e => { console.error(e.message); process.exit(1); });
}
