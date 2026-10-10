// OCHE — gegevensformaat, migraties en back-ups. Geen DOM; opslag wordt meegegeven zodat tests kunnen draaien.
import { isValidCode, parseInput } from './logic.js';

export const STORAGE_KEY = 'oche.data';
export const LEGACY_KEY = 'dartlog.v1';
export const DATA_VERSION = 2;

const PLAYER_COLORS = ['#3ddc84', '#ff5a5f', '#ffc53d', '#4cc9f0', '#c77dff', '#ff8fab'];

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptyData() {
  return {
    version: DATA_VERSION,
    players: [],
    activePlayerId: null,
    trainings: [],
    matches: [],
    active: { training: null, match: null },
    settings: { theme: 'dark', sound: true, vibrate: true },
  };
}

export function newPlayer(name, index = 0) {
  return { id: uid(), name: cleanName(name) || 'Speler', color: PLAYER_COLORS[index % PLAYER_COLORS.length], createdAt: new Date().toISOString() };
}

export function cleanName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
}

// ---------- Migratie van de eerste Dartlog-versie (localStorage "dartlog.v1") ----------
function legacyDartToCode(d) {
  if (d == null) return null;
  if (typeof d === 'string') {
    const r = parseInput(d);
    return r.error ? null : r.code;
  }
  if (typeof d === 'object') {
    if (d.segment === 25) return d.multiplier === 2 || d.points === 50 ? 'DB' : 'SB';
    if (d.points === 0) return 'M';
    if (d.segment && d.multiplier) return ({ 1: 'S', 2: 'D', 3: 'T' }[d.multiplier] || 'S') + d.segment;
    if (typeof d.points === 'number' && d.points > 0 && d.points <= 60) return 'X' + d.points;
    if (d.notation) { const r = parseInput(d.notation); if (!r.error) return r.code; }
  }
  return null;
}

export function migrateLegacy(old, playerName = 'Ik') {
  const data = emptyData();
  const player = newPlayer(playerName, 0);
  data.players.push(player);
  data.activePlayerId = player.id;
  for (const t of old.trainings || []) {
    const turns = [];
    for (const r of t.rounds || []) {
      const darts = (r.darts || []).map(legacyDartToCode).filter(Boolean);
      if (darts.length) turns.push({ at: r.createdAt || t.startedAt, darts });
    }
    if (!turns.length) continue;
    const limitDarts = t.dartLimit || null;
    data.trainings.push({
      id: t.id || uid(),
      playerId: player.id,
      kind: 'score',
      limitTurns: limitDarts ? Math.ceil(limitDarts / 3) : null,
      name: t.name || 'Scoretraining',
      startedAt: t.startedAt || turns[0].at,
      finishedAt: t.finishedAt || turns[turns.length - 1].at,
      turns,
      imported: 'dartlog-v1',
    });
  }
  return data;
}

// ---------- Validatie ----------
const ISO = s => typeof s === 'string' && !Number.isNaN(Date.parse(s));

function validTurns(turns, withPlayer) {
  return Array.isArray(turns) && turns.every(t => t && Array.isArray(t.darts) && t.darts.length >= 1 && t.darts.length <= 3 && t.darts.every(isValidCode) && (!withPlayer || Number.isInteger(t.p)));
}

export function validateData(d) {
  const errors = [];
  if (!d || typeof d !== 'object') return ['Geen geldig gegevensbestand.'];
  if (d.version !== DATA_VERSION) errors.push(`Onbekende versie ${d.version}.`);
  if (!Array.isArray(d.players)) errors.push('Spelerslijst ontbreekt.');
  if (!Array.isArray(d.trainings)) errors.push('Trainingen ontbreken.');
  if (!Array.isArray(d.matches)) errors.push('Wedstrijden ontbreken.');
  if (errors.length) return errors;
  const ids = new Set(d.players.map(p => p.id));
  d.players.forEach((p, i) => { if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') errors.push(`Speler ${i + 1} is ongeldig.`); });
  d.trainings.forEach((t, i) => {
    if (!t || typeof t.id !== 'string' || !ids.has(t.playerId) || !ISO(t.startedAt) || !['score', 'clock'].includes(t.kind) || !validTurns(t.turns, false)) errors.push(`Training ${i + 1} is ongeldig.`);
  });
  d.matches.forEach((m, i) => {
    const ok = m && typeof m.id === 'string' && ISO(m.startedAt) && Array.isArray(m.players) && m.players.length >= 1 && m.players.length <= 4
      && m.settings && [301, 501, 701].includes(m.settings.start) && [1, 3, 5, 7, 9].includes(m.settings.bestOf)
      && Array.isArray(m.legs) && m.legs.every(l => Number.isInteger(l.starter) && validTurns(l.turns, true));
    if (!ok) errors.push(`Wedstrijd ${i + 1} is ongeldig.`);
  });
  return errors.slice(0, 5);
}

// Ruwe JSON (back-up) omzetten naar data. Accepteert OCHE-back-ups en oude Dartlog-gegevens.
export function parseBackup(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { error: 'Dit is geen leesbaar back-upbestand (geen JSON).' }; }
  if (raw && raw.app === 'oche' && raw.data) raw = raw.data;
  if (raw && raw.version === 1 && Array.isArray(raw.trainings) && !raw.players) raw = migrateLegacy(raw);
  const errors = validateData(raw);
  if (errors.length) return { error: 'Back-up afgekeurd: ' + errors.join(' ') };
  const data = { ...emptyData(), ...raw, settings: { ...emptyData().settings, ...(raw.settings || {}) } };
  data.active = { training: null, match: null, ...(raw.active || {}) };
  return { data };
}

export function makeBackup(data) {
  return JSON.stringify({ app: 'oche', exportedAt: new Date().toISOString(), data }, null, 2);
}

// Samenvoegen: alles uit `incoming` toevoegen wat nog niet bestaat (op id).
export function mergeData(base, incoming) {
  const out = structuredClone(base);
  const has = (list, id) => list.some(x => x.id === id);
  for (const p of incoming.players) if (!has(out.players, p.id)) out.players.push(p);
  for (const t of incoming.trainings) if (!has(out.trainings, t.id)) out.trainings.push(t);
  for (const m of incoming.matches) if (!has(out.matches, m.id)) out.matches.push(m);
  if (!out.activePlayerId && out.players.length) out.activePlayerId = out.players[0].id;
  return out;
}

// ---------- Opslag ----------
export function createStore(storage) {
  let lastError = null;
  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const r = parseBackup(raw);
        if (r.data) return { data: r.data, source: 'oche' };
        // Beschadigde gegevens niet overschrijven: apart bewaren.
        storage.setItem(STORAGE_KEY + '.beschadigd.' + Date.now(), raw);
      }
      const legacy = storage.getItem(LEGACY_KEY);
      if (legacy) {
        const old = JSON.parse(legacy);
        if (old && Array.isArray(old.trainings) && old.trainings.length) return { data: migrateLegacy(old), source: 'legacy' };
      }
    } catch (e) {
      lastError = e;
    }
    return { data: emptyData(), source: 'new' };
  }
  function save(data) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(data));
      lastError = null;
      return true;
    } catch (e) {
      lastError = e;
      return false;
    }
  }
  return { load, save, get lastError() { return lastError; } };
}
