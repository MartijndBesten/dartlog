// OKKIE. Club (proef). Besloten clubruimte; alle rechten worden door de server gecontroleerd (cloud/src/clubs.js).
// Lokale trainingen blijven op dit toestel: per training kiest de speler zelf of de samenvatting naar de clubfeed en/of
// de weekoefening gaat. Staat standaard uit (CLUB_OPEN in community/config.js en CLUBS_ENABLED op de server).
import { CLUB_OPEN } from '../community/config.js';
import { apiAvailable, getAccount, upsertAccount, dropAccount, syncAccount, request } from '../js/community-sync.js';
import { shareableTrainings, CLUB_KIND_LABELS, clubAverage } from '../js/club-share.js';
import { prepare, publicUrl, isNative } from '../js/native.js';
import qrcode from '../js/vendor/qrcode.mjs';

await prepare();   // iPhone-app: duurzame kopie (op het web: niets)

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (x, d = 2) => x == null ? '–' : Number(x).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const PREFS = 'okkie.club.v1';
const HIDDEN = 'okkie.club.verborgen';   // verbergen op dit toestel, per club: { clubId: [handle, ...] }
const REPORT_TO = 'info@denckh.nl';
const ROLE = { admin: 'beheerder', captain: 'captain', member: 'lid' };
const leden = n => `${n} ${n === 1 ? 'lid' : 'leden'}`;
// "2026-11-08 22:00" → "zondag 8 november, 22:00"
const closeText = s => { const [d, t] = String(s).split(' '); const x = new Date(d + 'T12:00:00Z'); return Number.isFinite(x.getTime()) ? `${x.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}, ${t}` : s; };
const CONSENT_TEXT = 'Ik ben 16 jaar of ouder. Alleen leden van deze club zien mijn bijnaam, mijn gemiddelde van de laatste 4 weken, mijn resultaten bij de weekoefening en de trainingen die ik zelf in de clubfeed zet. Ik kan de club altijd verlaten; dan worden die gegevens gewist.';

function localData() {
  try { const d = JSON.parse(localStorage.getItem('oche.data') || 'null'); return d && Array.isArray(d.players) ? d : null; } catch { return null; }
}
const readJson = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? f; } catch { return f; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privémodus */ } };

const data = localData();
const state = { playerId: '', clubs: null, club: null, tab: 'week', code: '' };
state.playerId = readJson(PREFS, {}).playerId && data?.players.some(p => p.id === readJson(PREFS, {}).playerId) ? readJson(PREFS, {}).playerId
  : (data?.players.find(p => p.id === data.activePlayerId) || data?.players[0])?.id || '';
const acct = () => getAccount(state.playerId);
const player = () => data?.players.find(p => p.id === state.playerId);
// Clubcode uit een QR-code of link: in het #-deel, gaat dus nooit naar een server.
const fromHash = location.hash.match(/club=([A-Za-z0-9-]{8,10})/)?.[1];
if (fromHash) { state.code = fromHash.toUpperCase(); history.replaceState(null, '', location.pathname + location.search); }

function status(msg = '', error = false) { const el = $('#status'); el.textContent = msg; el.classList.toggle('error', !!error); }
async function api(path, method = 'GET', payload = null, auth = true) {
  if (!navigator.onLine) throw new Error('Je bent offline. Je trainingen staan veilig op je telefoon; probeer het opnieuw als je internet hebt.');
  try { return await request(path, method, payload, auth ? acct()?.token : null); }
  catch (e) {
    if (e instanceof TypeError) throw new Error('Geen verbinding met OKKIE. Online. Controleer je internet en probeer het opnieuw.');
    if (e.status === 429) throw new Error('Even rustig aan: probeer het over een minuut opnieuw.');
    throw e;
  }
}
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { status(e.message, true); } finally { if (btn?.isConnected) btn.disabled = false; }
}
const hiddenFor = clubId => new Set(readJson(HIDDEN, {})[clubId] || []);
function setHidden(clubId, set) { const all = readJson(HIDDEN, {}); if (set.size) all[clubId] = [...set].slice(-500); else delete all[clubId]; writeJson(HIDDEN, all); }
const reportLink = (club, r) => 'mailto:' + REPORT_TO + '?subject=' + encodeURIComponent('Melding OKKIE. Club: ' + r.handle) +
  '&body=' + encodeURIComponent(`Ik meld een clublid in OKKIE. Club:\n\nClub: ${club}\nNaam: ${r.nickname}\nProfielcode: ${r.handle}\n\nWaarom:\n`);

// ---------- schermen ----------
function playerPicker() {
  if (!data?.players?.length || data.players.length === 1) return data?.players?.length ? `<p class="muted small">Speler op deze telefoon: <b>${esc(player()?.name)}</b></p>` : '';
  return `<label class="field">Speler op deze telefoon<select id="player">${data.players.map(p => `<option value="${esc(p.id)}"${p.id === state.playerId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
}
function unavailable(text) { $('#vr').innerHTML = `<section class="card"><h2>OKKIE. Club</h2><p>${esc(text)}</p><p><a class="btn outline" href="../">Terug naar de app</a></p></section>`; }

function startView() {
  const mine = state.clubs || [];
  $('#vr').innerHTML = `${playerPicker()}
    ${mine.length ? `<section class="card"><h2>Mijn clubs</h2><ol class="board">${mine.map(c => `<li><span class="who"><b>${esc(c.name)}</b>
      <small>${c.status === 'pending' ? 'Aanvraag wacht op goedkeuring van de beheerder' : `${leden(c.members)} · ${ROLE[c.role]}`}</small></span><span></span>
      ${c.status === 'pending' ? `<button class="btn outline" type="button" data-cancel="${esc(c.id)}">Intrekken</button>` : `<button class="btn primary" type="button" data-open="${esc(c.id)}">Openen</button>`}</li>`).join('')}</ol></section>` : ''}
    <section class="card"><h2>Lid worden van je club</h2>
      <form id="join"><label class="field">Clubcode<input name="code" required autocomplete="off" autocapitalize="characters" maxlength="10" value="${esc(state.code)}" placeholder="Bijv. K7M2Q9RT"></label>
        <p id="preview" class="help"></p>
        <label class="check"><input type="checkbox" name="consent" required><span>${esc(CONSENT_TEXT)}</span></label>
        <button class="btn primary">Aanvraag versturen</button>
        <p class="help">De beheerder van de club keurt je aanvraag goed. Tot die tijd zie je niets van de club en ziet de club niets van jou.</p></form></section>
    <details class="card"><summary><b>Een club oprichten (proefclub)</b></summary>
      <form id="create"><p class="help">OKKIE. Club is in de proeffase. Met een proefclubcode van Denckh. maak je een club aan en word je beheerder.</p>
        <label class="field">Naam van de club<input name="name" required maxlength="40"></label>
        <label class="field">Proefclubcode<input name="pilot" required autocomplete="off"></label>
        <label class="check"><input type="checkbox" name="consent" required><span>${esc(CONSENT_TEXT)}</span></label>
        <button class="btn primary">Club oprichten</button></form></details>`;
  if (state.code) previewCode(state.code);
}
async function previewCode(code) {
  const out = $('#preview');
  if (!out) return;
  try { const r = await api('/v1/clubs/preview', 'POST', { code }, false); out.textContent = `${r.club.name} · ${leden(r.club.members)}`; }
  catch (e) { out.textContent = e.status === 404 ? 'Deze clubcode klopt niet.' : ''; }
}
// Account voor deze speler: bestaand (Darters of Mijn vrienden) of nieuw, altijd niet-openbaar.
async function ensureAccount(kind, code) {
  if (acct()?.token) return acct();
  const name = player()?.name || 'Speler';
  const body = { nickname: name.slice(0, 24), age: 'adult', [kind]: code };
  const r = await api('/v1/register', 'POST', body, false);
  upsertAccount(state.playerId, { id: r.account.id, handle: r.account.handle, nickname: r.account.nickname, token: r.token, recovery: r.recovery,
    enabled: true, groupsOnly: true, club: true, createdAt: new Date().toISOString() });
  return acct();
}
async function markClub() {
  const a = acct();
  if (a && !a.club) upsertAccount(state.playerId, { ...a, club: true, enabled: true, groupsOnly: a.groupsOnly ?? !a.enabled });
  // Weekcijfers voor de vormranglijst (alleen samenvattingen, zoals bij Darters).
  try { await syncAccount(localData(), state.playerId); } catch { /* volgt bij de volgende training */ }
}

async function openClub(id) {
  state.club = await api('/v1/clubs/' + id);
  state.club.id = id;
  renderClub();
}
function boardRow(r, value, sub = '') {
  return `<li class="${r.you ? 'you' : ''}"><span class="place">${r.rank ?? ''}</span><span class="who"><b>${esc(r.nickname)}${r.you ? ' (jij)' : ''}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="num">${value}</span></li>`;
}
function weekHtml(view) {
  const c = view.challenge;
  if (!c) return '<p class="help">Er is deze week nog geen weekoefening gekozen.</p>';
  const hidden = hiddenFor(state.club.id);
  const rows = (view.ranking || []).filter(r => !hidden.has(r.handle));
  const value = r => c.kind === 'clock' ? `${r.darts} pijlen` : fmt(r.average);
  return `<h3>${esc(CLUB_KIND_LABELS[c.kind])}</h3><p class="help">${c.open ? `Gooi hem wanneer het jou uitkomt; de ranglijst sluit ${esc(closeText(c.closesAt))}.` : 'Deze ranglijst is gesloten.'}
    ${c.kind === 'clock' ? 'Minder pijlen is beter.' : 'Gemiddelde per 3 pijlen; je beste poging telt.'}</p>
    ${rows.length ? `<ol class="board">${rows.map(r => boardRow(r, value(r))).join('')}</ol>` : '<p class="help">Nog niemand heeft deze oefening gegooid.</p>'}
    ${hiddenNote(view.ranking || [])}`;
}
function hiddenNote(list) {
  const n = list.filter(r => hiddenFor(state.club.id).has(r.handle)).length;
  return n ? `<p class="help hidden-note">${n} verborgen op dit toestel. <button class="btn outline" type="button" data-unhide>Weer tonen</button></p>` : '';
}
async function tabBody() {
  const id = state.club.id, me = state.club.club;
  if (state.tab === 'week') {
    const prev = await api(`/v1/clubs/${id}/challenge?week=previous`);
    return `<section class="card">${weekHtml(state.club.thisWeek)}</section>${prev.challenge ? `<details class="card"><summary><b>Vorige week</b></summary>${weekHtml(prev)}</details>` : ''}${shareHtml()}`;
  }
  if (state.tab === 'form') {
    const r = await api(`/v1/clubs/${id}/form`);
    const hidden = hiddenFor(id);
    const rows = r.ranking.filter(x => !hidden.has(x.handle)).map((x, i) => ({ ...x, rank: x.average == null ? '' : i + 1 }));
    return `<section class="card"><h3>Vorm: laatste ${r.weeks} weken</h3><p class="help">Gemiddelde per 3 pijlen over alle trainingen van de laatste ${r.weeks} weken (vanaf 30 pijlen).</p>
      <ol class="board">${rows.map(x => boardRow(x, x.average == null ? '–' : fmt(x.average), `${x.sessions} training${x.sessions === 1 ? '' : 'en'}`)).join('')}</ol>${hiddenNote(r.ranking)}</section>`;
  }
  if (state.tab === 'feed') {
    const r = await api(`/v1/clubs/${id}/feed`);
    const hidden = hiddenFor(id);
    const items = r.feed.filter(f => !hidden.has(f.handle));
    return `<section class="card"><h3>Clubfeed</h3><p class="help">Alleen trainingen die leden zelf delen, van de laatste 14 dagen. Alleen zichtbaar voor leden van deze club.</p>
      ${items.length ? items.map(f => `<div class="feed-item"><span><b>${esc(f.nickname)}${f.you ? ' (jij)' : ''}</b><small>${esc(CLUB_KIND_LABELS[f.kind] || f.kind)} · ${esc(f.at.slice(0, 10))}</small></span>
        <span>${f.kind === 'clock' ? `${f.darts} pijlen` : fmt(f.average)}${f.you || me.role === 'admin' ? ` <button class="btn outline" type="button" data-unfeed="${esc(f.id)}" aria-label="Bericht verwijderen">✕</button>` : ''}</span></div>`).join('') : '<p class="help">Nog geen gedeelde trainingen.</p>'}
      ${hiddenNote(r.feed)}</section>`;
  }
  if (state.tab === 'team') {
    const teams = state.club.teams.filter(t => me.role === 'admin' || t.captain === acct()?.handle);
    const parts = [];
    for (const t of teams) {
      const r = await api(`/v1/clubs/${id}/teams/${t.id}`);
      parts.push(`<section class="card"><h3>${esc(r.team.name)}</h3><p class="help">Vorm van de laatste ${r.weeks} weken en de weekoefening. Checkout-percentages volgen later.</p>
        <ol class="board">${r.players.map(p => boardRow(p, p.average == null ? '–' : fmt(p.average), `${p.sessions} trainingen · weekoefening: ${p.thisWeek ? `${p.thisWeek.rank}e` : 'nog niet'}`)).join('')}</ol></section>`);
    }
    return parts.join('') || '<section class="card"><p class="help">Je bent nog geen captain van een team.</p></section>';
  }
  if (state.tab === 'members') {
    const isAdmin = me.role === 'admin';
    const teamName = tid => state.club.teams.find(t => t.id === tid)?.name || '';
    const hidden = hiddenFor(id);
    return `<section class="card"><h3>Leden (${state.club.members.length})</h3><ol class="board">${state.club.members.map(m => `<li class="${m.you ? 'you' : ''}"><span class="who"><b>${esc(m.nickname)}${m.you ? ' (jij)' : ''}</b>
      <small>${ROLE[m.role]}${m.teamId ? ' · ' + esc(teamName(m.teamId)) : ''}${hidden.has(m.handle) ? ' · verborgen' : ''}</small></span><span></span>
      ${m.you ? '' : `<span><button class="btn outline" type="button" data-hide="${esc(m.handle)}">${hidden.has(m.handle) ? 'Tonen' : 'Verbergen'}</button>
        <a class="btn outline" href="${esc(reportLink(state.club.club.name, m))}">Melden</a>
        ${isAdmin ? `<select data-role="${esc(m.handle)}" aria-label="Rol van ${esc(m.nickname)}">${Object.entries(ROLE).map(([k, t]) => `<option value="${k}"${m.role === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <select data-team="${esc(m.handle)}" aria-label="Team van ${esc(m.nickname)}"><option value="">Geen team</option>${state.club.teams.map(t => `<option value="${esc(t.id)}"${m.teamId === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        <button class="btn danger" type="button" data-remove="${esc(m.handle)}">Verwijderen</button>` : ''}</span>`}</li>`).join('')}</ol>
      <p class="help">Verbergen geldt alleen op dit toestel. Ongepaste naam of verdachte score? Meld het; we kijken er binnen een paar dagen naar. De beheerder kan resultaten en leden verwijderen.</p></section>
      <section class="card"><h3>Club verlaten</h3><p class="help">Je lidmaatschap, je weekresultaten en je berichten in de feed van deze club worden gewist. Je trainingen op deze telefoon blijven.</p>
        <button class="btn danger" type="button" data-leave>Club verlaten</button></section>`;
  }
  if (state.tab === 'admin') return adminHtml();
  return '';
}
function shareHtml() {
  const list = shareableTrainings(localData(), state.playerId, 7);
  const c = state.club.thisWeek.challenge;
  if (!list.length) return '<section class="card"><h3>Training delen</h3><p class="help">Je hebt de afgelopen 7 dagen geen afgeronde training op deze telefoon.</p></section>';
  return `<section class="card"><h3>Training delen</h3><p class="help">Kies per training wat je met de club deelt. Alleen soort, punten, aantal pijlen en hoogste beurt gaan mee; nooit losse pijlen.</p>
    ${list.slice(0, 10).map(({ t, c: s }) => {
      const fits = c && c.open && c.kind === s.kind;
      return `<form class="share-row" data-share="${esc(t.id)}"><span><b>${esc(CLUB_KIND_LABELS[s.kind])}</b> <small class="muted">${esc(String(t.finishedAt).slice(0, 10))} · ${s.kind === 'clock' ? `${s.darts} pijlen` : fmt(clubAverage(s.points, s.darts))}</small>
        <span class="opts"><label><input type="checkbox" name="feed"> In de clubfeed</label>${fits ? '<label><input type="checkbox" name="challenge" checked> Weekoefening</label>' : ''}</span></span>
        <button class="btn outline">Delen</button></form>`;
    }).join('')}</section>`;
}
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR-code met de clubcode' });
}
async function adminHtml() {
  const id = state.club.id, c = state.club.club;
  const link = publicUrl('club/') + '#club=' + c.inviteCode;
  const reqs = (await api(`/v1/clubs/${id}/requests`)).requests;
  const next = await api(`/v1/clubs/${id}/challenge?week=next`);
  const kinds = Object.entries(CLUB_KIND_LABELS).filter(([k]) => k !== 'free');
  return `<section class="card"><h3>Aanvragen (${reqs.length})</h3>${reqs.length ? `<ol class="board">${reqs.map(r => `<li><span class="who"><b>${esc(r.nickname)}</b><small>aangevraagd ${esc(r.requestedAt)}</small></span><span></span>
      <span><button class="btn primary" type="button" data-approve="${esc(r.handle)}">Toelaten</button> <button class="btn outline" type="button" data-reject="${esc(r.handle)}">Afwijzen</button></span></li>`).join('')}</ol>` : '<p class="help">Geen openstaande aanvragen.</p>'}</section>
    <section class="card"><h3>Uitnodigen</h3><p class="help">Laat leden deze QR-code scannen of geef ze de code. Een aanvraag moet jij altijd nog goedkeuren.</p>
      <div class="club-qr">${qrSvg(link)}</div><p class="club-code">${esc(c.inviteCode)}</p>
      <div class="row"><button class="btn outline" type="button" data-sharelink="${esc(link)}">Link delen</button> <button class="btn outline" type="button" data-newcode>Nieuwe code</button></div>
      <p class="help">Een nieuwe code maakt de oude direct ongeldig.</p></section>
    <section class="card"><h3>Weekoefening</h3>
      <form id="challenge"><label class="field">Deze week<select name="kind">${kinds.map(([k, t]) => `<option value="${k}"${state.club.thisWeek.challenge?.kind === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><button class="btn primary">Opslaan</button></form>
      <form id="challenge-next"><label class="field">Volgende week<select name="kind">${kinds.map(([k, t]) => `<option value="${k}"${next.challenge?.kind === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><button class="btn outline">Klaarzetten</button></form>
      <p class="help">Als er al resultaten zijn, kan de oefening van deze week niet meer wijzigen. Een verdachte score verwijder je bij de ranglijst van deze week:</p>
      ${(state.club.thisWeek.ranking || []).map(r => `<button class="btn outline" type="button" data-unresult="${esc(r.handle)}">Resultaat ${esc(r.nickname)} verwijderen</button>`).join(' ')}</section>
    <section class="card"><h3>Teams</h3>${state.club.teams.length ? `<ol class="board">${state.club.teams.map(t => `<li><span class="who"><b>${esc(t.name)}</b><small>captain: ${esc(state.club.members.find(m => m.handle === t.captain)?.nickname || 'nog geen')}</small></span><span></span>
      <span><select data-captain="${esc(t.id)}" aria-label="Captain van ${esc(t.name)}"><option value="">Geen captain</option>${state.club.members.map(m => `<option value="${esc(m.handle)}"${t.captain === m.handle ? ' selected' : ''}>${esc(m.nickname)}</option>`).join('')}</select>
      <button class="btn danger" type="button" data-delteam="${esc(t.id)}">Verwijderen</button></span></li>`).join('')}</ol>` : '<p class="help">Nog geen teams.</p>'}
      <form id="team" class="row"><input name="name" required maxlength="40" placeholder="Naam van het team" aria-label="Naam van het team"><button class="btn outline">Team toevoegen</button></form></section>
    <section class="card"><h3>Club opheffen</h3><p class="help">Alle leden, teams, weekoefeningen, resultaten en berichten van deze club worden gewist.</p><button class="btn danger" type="button" data-delclub>Club opheffen</button></section>`;
}
async function renderClub() {
  const c = state.club.club;
  const tabs = [['week', 'Weekoefening'], ['form', 'Vorm'], ['feed', 'Feed'], ...(c.role !== 'member' ? [['team', 'Team']] : []), ['members', 'Leden'], ...(c.role === 'admin' ? [['admin', `Beheer${c.pending ? ` (${c.pending})` : ''}`]] : [])];
  if (!tabs.some(([k]) => k === state.tab)) state.tab = 'week';
  $('#vr').innerHTML = `<p><button class="back btn outline" type="button" data-home>← Mijn clubs</button></p>
    <header class="g-head"><h2>${esc(c.name)}</h2><p class="muted small">${leden(state.club.members.length)} · jij bent ${ROLE[c.role]}</p></header>
    <div class="tabs" role="tablist" aria-label="Onderdelen">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${t}</button>`).join('')}</div>
    <div role="tabpanel" id="panel"><p class="muted">Laden…</p></div>`;
  try { $('#panel').innerHTML = await tabBody(); } catch (e) { $('#panel').innerHTML = `<p class="help">${esc(e.message)}</p>`; }
}
async function home() {
  state.club = null;
  if (!acct()?.token) { state.clubs = []; return startView(); }
  try { state.clubs = (await api('/v1/clubs')).clubs; }
  catch (e) {
    if (e.status === 401) { dropAccount(state.playerId); state.clubs = []; status('Dit profiel is niet meer geldig op deze telefoon.', true); }
    else throw e;
  }
  startView();
}

// ---------- acties ----------
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const id = state.club?.id, d = b.dataset;
  const after = async (msg, reload = true) => { status(msg); if (reload) await openClub(id); };
  if (d.open) busy(b, () => openClub(d.open));
  else if (d.home !== undefined) busy(b, home);
  else if (d.tab) { state.tab = d.tab; busy(b, renderClub); }
  else if (d.cancel) busy(b, async () => { await api(`/v1/clubs/${d.cancel}/me`, 'DELETE'); status('Aanvraag ingetrokken.'); await home(); });
  else if (d.hide) { const s = hiddenFor(id); s.has(d.hide) ? s.delete(d.hide) : s.add(d.hide); setHidden(id, s); renderClub(); }
  else if (d.unhide !== undefined) { setHidden(id, new Set()); renderClub(); }
  else if (d.unfeed) busy(b, async () => { await api(`/v1/clubs/${id}/feed/${d.unfeed}`, 'DELETE'); await after('Bericht verwijderd.'); });
  else if (d.leave !== undefined) {
    if (!confirm('Club verlaten? Je weekresultaten en berichten in deze club worden gewist. Je trainingen op deze telefoon blijven.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}/me`, 'DELETE'); status('Je hebt de club verlaten; je clubgegevens zijn gewist.'); await home(); });
  }
  else if (d.approve || d.reject) busy(b, async () => { await api(`/v1/clubs/${id}/requests/${d.approve || d.reject}`, 'POST', { approve: !!d.approve }); await after(d.approve ? 'Lid toegelaten.' : 'Aanvraag afgewezen.'); });
  else if (d.remove) {
    if (!confirm('Dit lid uit de club verwijderen? Zijn resultaten en berichten in deze club worden gewist.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}/members/${d.remove}`, 'DELETE'); await after('Lid verwijderd.'); });
  }
  else if (d.newcode !== undefined) {
    if (!confirm('Nieuwe code maken? De oude code en QR-code werken dan niet meer.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}/code`, 'POST'); await after('Nieuwe code gemaakt.'); });
  }
  else if (d.sharelink) busy(b, async () => {
    const text = `Word lid van ${state.club.club.name} in OKKIE. Club: ${d.sharelink}`;
    if (navigator.share) await navigator.share({ text }).catch(() => {}); else { await navigator.clipboard?.writeText(text); status('Link gekopieerd.'); }
  });
  else if (d.unresult) busy(b, async () => { await api(`/v1/clubs/${id}/results/${d.unresult}`, 'DELETE'); await after('Resultaat verwijderd.'); });
  else if (d.delteam) busy(b, async () => { await api(`/v1/clubs/${id}/teams/${d.delteam}`, 'DELETE'); await after('Team verwijderd.'); });
  else if (d.delclub !== undefined) {
    if (!confirm('Club opheffen? Alles van deze club wordt gewist, voor alle leden.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}`, 'DELETE'); status('Club opgeheven.'); await home(); });
  }
});
document.addEventListener('change', e => {
  const t = e.target, id = state.club?.id;
  if (t.id === 'player') { state.playerId = t.value; writeJson(PREFS, { playerId: t.value }); busy(null, home); }
  else if (t.dataset.role) busy(null, async () => { await api(`/v1/clubs/${id}/members/${t.dataset.role}`, 'PATCH', { role: t.value }); status('Rol gewijzigd.'); await openClub(id); });
  else if (t.dataset.team !== undefined && t.matches('select[data-team]')) busy(null, async () => { await api(`/v1/clubs/${id}/members/${t.dataset.team}`, 'PATCH', { teamId: t.value || null }); status('Team gewijzigd.'); await openClub(id); });
  else if (t.dataset.captain) busy(null, async () => { await api(`/v1/clubs/${id}/teams/${t.dataset.captain}`, 'PATCH', { captain: t.value || null }); status('Captain gewijzigd.'); await openClub(id); });
});
document.addEventListener('input', e => { if (e.target.name === 'code' && e.target.value.replace(/[\s-]/g, '').length === 8) previewCode(e.target.value); });
document.addEventListener('submit', e => {
  const f = e.target, btn = f.querySelector('button'), id = state.club?.id;
  e.preventDefault();
  if (f.id === 'join') busy(btn, async () => {
    const code = f.elements.code.value;
    if (!f.elements.consent.checked) throw new Error('Bevestig eerst wat je met de club deelt.');
    await ensureAccount('clubCode', code);
    const r = await api('/v1/clubs/join', 'POST', { code, consent: true });
    await markClub();
    status(r.status === 'active' ? `Je bent al lid van ${r.club.name}.` : `Aanvraag verstuurd naar ${r.club.name}. De beheerder keurt hem goed.`);
    await home();
  });
  else if (f.id === 'create') busy(btn, async () => {
    const pilotCode = f.elements.pilot.value.trim();
    if (!f.elements.consent.checked) throw new Error('Bevestig eerst wat je met de club deelt.');
    await ensureAccount('pilotCode', pilotCode);
    const r = await api('/v1/clubs', 'POST', { name: f.elements.name.value, pilotCode, consent: true });
    await markClub();
    status(`${r.club.name} is aangemaakt. Jij bent beheerder.`);
    state.tab = 'admin';
    await openClub(r.club.id);
  });
  else if (f.dataset.share) busy(btn, async () => {
    const item = shareableTrainings(localData(), state.playerId, 7).find(x => String(x.t.id) === f.dataset.share);
    const feed = !!f.elements.feed?.checked, challenge = !!f.elements.challenge?.checked;
    if (!item) throw new Error('Training niet gevonden.');
    if (!feed && !challenge) throw new Error('Kies of je de training in de feed en/of bij de weekoefening zet.');
    const r = await api(`/v1/clubs/${id}/trainings`, 'POST', { training: item.c, feed, challenge });
    status(r.challenge ? (r.challenge.best ? 'Gedeeld: dit is je beste resultaat van de week.' : 'Gedeeld; je eerdere resultaat deze week was beter en blijft staan.') : 'Gedeeld in de clubfeed.');
    await openClub(id);
  });
  else if (f.id === 'challenge' || f.id === 'challenge-next') busy(btn, async () => {
    await api(`/v1/clubs/${id}/challenge`, 'PUT', { kind: f.elements.kind.value, ...(f.id === 'challenge-next' ? { week: 'next' } : {}) });
    status('Weekoefening opgeslagen.'); await openClub(id);
  });
  else if (f.id === 'team') busy(btn, async () => { await api(`/v1/clubs/${id}/teams`, 'POST', { name: f.elements.name.value }); status('Team toegevoegd.'); await openClub(id); });
});

// ---------- start ----------
if (!CLUB_OPEN || !apiAvailable()) unavailable('OKKIE. Club is nog niet beschikbaar. We testen het eerst met een paar dartverenigingen.');
else if (!data?.players?.length) unavailable('Maak eerst in de app een speler aan en gooi een training. Daarna kun je lid worden van je club.');
else busy(null, home);
void isNative;
