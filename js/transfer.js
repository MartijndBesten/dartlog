// OKKIE. — gegevens overzetten tussen twee OKKIE.-installaties. Zie VERHUIZING.md.
//
// Waarom: browseropslag hoort bij één adres. De verhuizing van martijndbesten.github.io/dartlog/ naar
// app.okkiedarts.nl begint daarom leeg, en een op het iPhone-beginscherm gezette app kan los van Safari
// staan. De speler zet zijn gegevens bewust over; er wordt nooit iets gewist en nooit automatisch doorgestuurd.
//
// Drie routes, allemaal met dezelfde controle:
// 1. Automatisch tussen twee vensters (postMessage, uitsluitend tussen precies het oude en het nieuwe adres).
// 2. Overzetcode via kopiëren en plakken (werkt ook vanuit een geïnstalleerde iPhone-app).
// 3. Het gewone back-upbestand.
// Samenvoegen gaat op ID: twee keer overzetten geeft nooit dubbele spelers, trainingen of wedstrijden.
// Na afloop wordt niet alleen geteld, maar per record de inhoud vergeleken (vingerafdruk) en per speler
// het aantal trainingen, pijlen, punten en het gemiddelde.
import { parseBackup, mergeData } from './store.js';
import { trainingTotals, avg3 } from './logic.js';

// open: of de verhuizing op het oude adres wordt aangekondigd. Pas op true zetten als app.okkiedarts.nl
// live staat en de overdracht op echte toestellen is getest (VERHUIZING.md, stap 4).
export const PROD = { oldOrigin: 'https://martijndbesten.github.io', oldPath: '/dartlog/', newApp: 'https://app.okkiedarts.nl/', open: false };

// Alleen voor tests op localhost: localStorage 'okkie.dev' = { transfer: { oldOrigin, oldPath, newApp, open } }.
const isLocal = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export function config() {
  if (!isLocal()) return PROD;
  try { return { ...PROD, ...(JSON.parse(localStorage.getItem('okkie.dev') || '{}').transfer || {}) }; } catch { return PROD; }
}
export const NEW_APP = () => config().newApp;
export const newOrigin = () => new URL(config().newApp).origin;
export function role() {
  if (typeof location === 'undefined') return null;
  const c = config();
  if (location.origin === c.oldOrigin && location.pathname.startsWith(c.oldPath)) return 'old';
  if (location.origin === newOrigin()) return 'new';
  return null;
}
export const announce = () => role() === 'old' && config().open === true;

// ---------- Inhoud, telling en vingerafdruk ----------
export function summary(d) {
  return { players: d.players.length, trainings: d.trainings.length, matches: d.matches.length, active: !!(d.active?.training || d.active?.match) };
}
export function summaryText(s) {
  const n = (v, one, more) => `${v} ${v === 1 ? one : more}`;
  return `${n(s.players, 'speler', 'spelers')}, ${n(s.trainings, 'training', 'trainingen')}, ${n(s.matches, 'wedstrijd', 'wedstrijden')}${s.active ? ' en een lopende training' : ''}`;
}

// Vaste volgorde van sleutels, zodat dezelfde inhoud altijd dezelfde tekst oplevert.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
export const recordKey = canon;
const byId = list => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Vingerafdruk van alles wat telt: spelers, trainingen (elke pijl), wedstrijden en de lopende sessies.
export function fingerprint(d) {
  return sha256(canon({ players: byId(d.players), trainings: byId(d.trainings), matches: byId(d.matches), active: d.active || { training: null, match: null } }));
}

// Per speler: trainingen, pijlen, punten en gemiddelde (scoretrainingen).
export function playerStats(d, playerId, onlyIds = null) {
  const ts = d.trainings.filter(t => t.playerId === playerId && (!onlyIds || onlyIds.has(t.id)));
  let darts = 0, points = 0;
  for (const t of ts.filter(t => t.kind === 'score')) { const x = trainingTotals(t); darts += x.darts; points += x.points; }
  return { trainings: ts.length, darts, points, avg: avg3(points, darts) };
}

// ---------- Extra sleutels naast de trainingsgegevens ----------
// Online profielen (Community, Mijn vrienden), gastkoppelingen en back-upherinneringen. Zonder deze
// sleutels zou je na de verhuizing de toegang tot je online profiel kwijt zijn.
const EXTRA_KEYS = ['okkie.community.v1', 'okkie.guest.v1', 'okkie.vrienden.v1'];
const BACKUP_PREFIX = 'okkie.backup.last-count.';
export function readExtras(storage) {
  const out = {};
  try {
    for (const k of EXTRA_KEYS) { const v = storage.getItem(k); if (v) out[k] = v; }
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(BACKUP_PREFIX)) out[k] = storage.getItem(k); }
  } catch { /* privémodus: alleen de trainingen */ }
  return out;
}
// Nooit iets overschrijven wat in de ontvangende app al staat.
export function writeExtras(storage, extras = {}) {
  const parse = v => { try { return JSON.parse(v); } catch { return null; } };
  for (const [k, v] of Object.entries(extras)) {
    if (typeof v !== 'string' || !(EXTRA_KEYS.includes(k) || k.startsWith(BACKUP_PREFIX))) continue;
    const have = storage.getItem(k);
    if (k === 'okkie.community.v1') {
      const inc = parse(v)?.accounts, cur = parse(have)?.accounts || {};
      if (!inc || typeof inc !== 'object') continue;
      const merged = { ...cur };
      for (const [pid, acc] of Object.entries(inc)) if (!merged[pid]) merged[pid] = acc;
      storage.setItem(k, JSON.stringify({ version: 1, accounts: merged }));
    } else if (k.startsWith(BACKUP_PREFIX)) {
      storage.setItem(k, String(Math.max(Number(have) || 0, Number(v) || 0)));
    } else if (!have) storage.setItem(k, v);
  }
}

// ---------- Samenvoegen ----------
// Nieuwe app leeg: alles overnemen (ook lopende training en instellingen). Anders veilig samenvoegen op ID.
// Een lopende training of wedstrijd wordt alleen overgenomen als er hier geen loopt én hij hier niet al
// is afgerond (anders zou hij twee keer meetellen).
export function mergeTransfer(base, incoming) {
  const empty = !base.players.length && !base.trainings.length && !base.matches.length && !base.active?.training && !base.active?.match;
  if (empty) return { data: structuredClone(incoming), skippedActive: null };
  const out = mergeData(base, incoming);
  out.active = { training: null, match: null, ...(out.active || {}) };
  let skippedActive = null;
  const it = incoming.active?.training, im = incoming.active?.match;
  if (it) {
    const finishedHere = out.trainings.some(t => t.id === it.id || t.groupId === it.id);
    const known = (it.players || [it.playerId]).every(id => out.players.some(p => p.id === id));
    if (!out.active.training && !finishedHere && known) out.active.training = structuredClone(it);
    else if (canon(out.active.training) !== canon(it)) skippedActive = finishedHere ? 'afgerond' : 'bezet';
  }
  if (im) {
    const finishedHere = out.matches.some(m => m.id === im.id);
    if (!out.active.match && !finishedHere) out.active.match = structuredClone(im);
    else if (canon(out.active.match) !== canon(im)) skippedActive = skippedActive || (finishedHere ? 'afgerond' : 'bezet');
  }
  return { data: out, skippedActive };
}

// Controle na het samenvoegen: staat elk ontvangen record er, met precies dezelfde inhoud?
export function verifyTransfer(incoming, merged) {
  const index = list => new Map(list.map(x => [x.id, x]));
  const res = { missing: [], different: [], players: [], active: 'geen' };
  for (const kind of ['players', 'trainings', 'matches']) {
    const have = index(merged[kind]);
    for (const x of incoming[kind]) {
      const y = have.get(x.id);
      if (!y) res.missing.push(`${kind}:${x.id}`);
      else if (canon(x) !== canon(y)) res.different.push(`${kind}:${x.id}`);
    }
  }
  const ids = new Set(incoming.trainings.map(t => t.id));
  for (const p of incoming.players) {
    const a = playerStats(incoming, p.id), b = playerStats(merged, p.id, ids);
    res.players.push({ id: p.id, name: p.name, ...a, same: a.trainings === b.trainings && a.darts === b.darts && a.points === b.points });
  }
  const it = incoming.active?.training, im = incoming.active?.match;
  if (it || im) {
    const same = (!it || canon(it) === canon(merged.active?.training)) && (!im || canon(im) === canon(merged.active?.match));
    res.active = same ? 'overgenomen' : 'niet overgenomen';
  }
  res.ok = !res.missing.length && !res.different.length && res.players.every(p => p.same);
  return res;
}

// Twee spelers met dezelfde naam (bijv. eerst in de nieuwe app begonnen, daarna overgezet) samenvoegen
// tot één speler. Alleen als ze nooit samen in één wedstrijd of training zaten en niet allebei online zijn.
export function mergePlayers(d, keepId, dropId, accounts = {}) {
  if (keepId === dropId) return { error: 'Dat is dezelfde speler.' };
  const keep = d.players.find(p => p.id === keepId), drop = d.players.find(p => p.id === dropId);
  if (!keep || !drop) return { error: 'Speler niet gevonden.' };
  const together = list => list.some(ids => ids.includes(keepId) && ids.includes(dropId));
  if (together(d.matches.map(m => m.players.map(p => p.id))) || together(d.trainings.filter(t => t.groupPlayers).map(t => t.groupPlayers))
    || together([d.active?.training?.players || [], (d.active?.match?.players || []).map(p => p.id)])) {
    return { error: `${keep.name} en ${drop.name} hebben samen gegooid; dat zijn dus twee verschillende spelers.` };
  }
  if (accounts[keepId] && accounts[dropId]) return { error: 'Beide spelers hebben een online profiel. Samenvoegen kan dan niet.' };
  const out = structuredClone(d);
  const map = id => (id === dropId ? keepId : id);
  out.trainings.forEach(t => { t.playerId = map(t.playerId); if (t.groupPlayers) t.groupPlayers = t.groupPlayers.map(map); });
  out.matches.forEach(m => m.players.forEach(p => { if (p.id === dropId) { p.id = keepId; p.name = keep.name; } }));
  const at = out.active?.training;
  if (at) { at.players = (at.players || [at.playerId]).map(map); at.playerId = map(at.playerId); }
  out.active?.match?.players.forEach(p => { if (p.id === dropId) { p.id = keepId; p.name = keep.name; } });
  out.players = out.players.filter(p => p.id !== dropId);
  if (out.activePlayerId === dropId) out.activePlayerId = keepId;
  return { data: out, moveAccount: !accounts[keepId] && !!accounts[dropId] };
}
export function sameNamePairs(d) {
  const seen = new Map(), pairs = [];
  for (const p of d.players) {
    const k = p.name.trim().toLowerCase();
    if (seen.has(k)) pairs.push([seen.get(k), p]); else seen.set(k, p);
  }
  return pairs;
}

// ---------- Overzetcode (klembord) ----------
export const PREFIX = 'OKKIE-OVERZETTEN-1:';
const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
async function gzip(bytes, mode) {
  const stream = new Blob([bytes]).stream().pipeThrough(mode === 'in' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function makePackage(data, extras = {}) {
  return { app: 'okkie', kind: 'overzetten', v: 1, exportedAt: new Date().toISOString(), data, extras, fingerprint: await fingerprint(data) };
}
// Controleert vorm (zelfde regels als een back-up) én vingerafdruk: een afgebroken of veranderde code wordt geweigerd.
export async function openPackage(pkg) {
  if (!pkg || pkg.app !== 'okkie' || !pkg.data) return { error: 'Dit zijn geen OKKIE.-gegevens.' };
  const r = parseBackup(JSON.stringify({ app: 'okkie', data: pkg.data }));
  if (r.error) return r;
  if (pkg.fingerprint && pkg.fingerprint !== await fingerprint(pkg.data)) return { error: 'De gegevens zijn onderweg veranderd of onvolledig. Maak een nieuwe code in de oude app.' };
  return { data: r.data, extras: pkg.extras || {}, fingerprint: pkg.fingerprint || null };
}
export async function pack(data, extras = {}) {
  const json = JSON.stringify(await makePackage(data, extras));
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return PREFIX + 'j:' + toB64(bytes);
  return PREFIX + 'z:' + toB64(await gzip(bytes, 'in'));
}
export async function unpack(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t.startsWith(PREFIX)) return { error: 'Dit is geen OKKIE.-overzetcode. Kopieer hem opnieuw in de andere app.' };
  try {
    const kind = t.slice(PREFIX.length, PREFIX.length + 1), b64 = t.slice(PREFIX.length + 2);
    const bytes = fromB64(b64);
    const json = new TextDecoder().decode(kind === 'z' ? await gzip(bytes, 'out') : bytes);
    return openPackage(JSON.parse(json));
  } catch { return { error: 'De code is onvolledig of beschadigd. Kopieer hem opnieuw in de andere app.' }; }
}

// ---------- Automatisch tussen twee vensters (alleen deze twee adressen) ----------
// Oude app: opent de nieuwe app, wacht op "klaar", stuurt de gegevens en wacht op de controle.
export function sendViaWindow(pkg, { timeout = 25000, open = (u, n) => window.open(u, n) } = {}) {
  return new Promise((resolve, reject) => {
    const target = newOrigin();
    const nonce = Math.random().toString(36).slice(2);
    const win = open(NEW_APP() + '#overzetten', '_blank');
    if (!win) return reject(new Error('popup'));
    let sent = false;
    const done = (fn, v) => { clearTimeout(timer); removeEventListener('message', onMsg); fn(v); };
    const timer = setTimeout(() => done(reject, new Error('timeout')), timeout);
    function onMsg(e) {
      if (e.origin !== target || e.source !== win || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'okkie-transfer-ready' && !sent) { sent = true; win.postMessage({ type: 'okkie-transfer', nonce, pkg }, target); }
      if (e.data.nonce !== nonce) return;
      if (e.data.type === 'okkie-transfer-done') done(resolve, e.data.result);
      if (e.data.type === 'okkie-transfer-error') done(reject, new Error(e.data.error || 'mislukt'));
    }
    addEventListener('message', onMsg);
  });
}
// Nieuwe app, geopend door de oude met #overzetten: meldt zich, ontvangt, voegt samen, stuurt de controle terug.
export function receiveViaWindow(onPackage) {
  if (typeof window === 'undefined' || !/overzetten/.test(location.hash) || !window.opener) return false;
  const from = config().oldOrigin;
  let got = false;
  const ping = setInterval(() => { try { window.opener.postMessage({ type: 'okkie-transfer-ready' }, from); } catch { /* venster dicht */ } }, 400);
  setTimeout(() => clearInterval(ping), 25000);
  addEventListener('message', async e => {
    if (got || e.origin !== from || e.source !== window.opener || e.data?.type !== 'okkie-transfer') return;
    got = true; clearInterval(ping);
    const r = await openPackage(e.data.pkg);
    if (r.error) return e.source.postMessage({ type: 'okkie-transfer-error', nonce: e.data.nonce, error: r.error }, from);
    const result = await onPackage(r);
    e.source.postMessage({ type: 'okkie-transfer-done', nonce: e.data.nonce, result }, from);
  });
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}

// ---------- Volledige ontvangst (gedeeld door alle routes) ----------
// Geeft de nieuwe gegevens en een controleverslag terug; schrijft niets weg (dat doet de app).
export async function receive(base, opened) {
  const { data, skippedActive } = mergeTransfer(base, opened.data);
  const check = verifyTransfer(opened.data, data);
  // Vingerafdruk van wat hier nu staat van de ontvangen spelers/trainingen/wedstrijden: moet gelijk zijn aan de bron.
  const ids = k => new Set(opened.data[k].map(x => x.id));
  // (De lopende sessie telt hier niet mee; die staat apart in check.active.)
  const subset = { players: data.players.filter(p => ids('players').has(p.id)), trainings: data.trainings.filter(t => ids('trainings').has(t.id)), matches: data.matches.filter(m => ids('matches').has(m.id)), active: opened.data.active };
  const sameContent = (await fingerprint(subset)) === (opened.fingerprint || await fingerprint(opened.data));
  return { data, report: { ...check, skippedActive, sameContent, received: summary(opened.data), here: summary(data) } };
}

