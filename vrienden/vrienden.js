// OKKIE. Mijn vrienden. Besloten groepen; alle rechten worden door de server gecontroleerd.
// Lokale trainingen blijven op dit toestel: online gaan alleen de samenvattingen die de speler per groep kiest.
import { GROUPS_OPEN } from '../community/config.js';
import { apiAvailable, getAccount, upsertAccount, dropAccount, syncAccount, request, publicSnapshots } from '../js/community-sync.js';
import { leaderboards, movement, placesOf, avg3, MIN_DARTS_ALL, MIN_DARTS_WEEK } from '../js/group-stats.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (x, d = 2) => x == null ? '–' : Number(x).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const LOCAL_KEY = 'okkie.vrienden.v1';
const COLORS = ['#b8ff3c', '#3ddc84', '#ffc53d', '#7cc7ff'];
const SHARE_LABELS = {
  average: ['Gemiddelde en aantal trainingen', 'Je gemiddelde per 3 pijlen, trainingen per week en je ontwikkeling.'],
  records: ['Records', 'Hoogste beurt, beste 30/60/99 pijlen en je 100+/140+/180’s.'],
  challenge: ['30-pijlenchallenge', 'Je eerste 30-pijlentraining van de week.'],
};

// ---------- lokale gegevens (alleen lezen) ----------
function localData() {
  try {
    const d = JSON.parse(localStorage.getItem('oche.data') || 'null');
    return d && Array.isArray(d.players) && Array.isArray(d.trainings) ? d : null;
  } catch { return null; }
}
function prefs() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; } }
function savePrefs(p) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(p)); } catch { /* alleen gemak */ } }

const state = { playerId: '', groups: null, group: null, tab: 'week', board: 'overall', records: 'best30', compare: [], invite: null, inviteToken: '' };
let data = localData();
state.playerId = prefs().playerId && data?.players.some(p => p.id === prefs().playerId) ? prefs().playerId :
  (data?.players.find(p => p.id === data.activePlayerId) || data?.players[0])?.id || '';
const acct = () => getAccount(state.playerId);
const player = () => data?.players.find(p => p.id === state.playerId);

// Uitnodigingstoken staat in het #-deel van de link: dat gaat nooit naar een server of in een Referer-header.
const fromHash = location.hash.match(/uitnodiging=([a-f0-9]{64})/)?.[1];
if (fromHash) { state.inviteToken = fromHash; history.replaceState(null, '', location.pathname + location.search); }

function status(msg = '', error = false) {
  const el = $('#status');
  el.textContent = msg;
  el.classList.toggle('error', !!error);
}
// Netwerkfouten vertalen naar begrijpelijke taal; trainen werkt altijd door.
async function api(path, method = 'GET', payload = null, auth = true) {
  if (!navigator.onLine) throw new Error('Je bent offline. Je trainingen staan veilig op je telefoon; probeer het opnieuw als je internet hebt.');
  try { return await request(path, method, payload, auth ? acct()?.token : null); }
  catch (e) {
    if (e instanceof TypeError) throw new Error('Geen verbinding met OKKIE. Online. Controleer je internet en probeer het opnieuw. Je trainingen staan veilig op je telefoon.');
    if (/429/.test(e.message)) throw new Error('Even rustig aan: probeer het over een minuut opnieuw.');
    throw e;
  }
}
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { status(e.message, true); } finally { if (btn?.isConnected) btn.disabled = false; }
}
function focusView() { const h = $('#vr h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: false }); } }
function animate(el) { if (!reduce.matches) el.classList.add('anim'); }

// ---------- onderdelen ----------
function playerPicker() {
  if (!data?.players?.length) return '';
  if (data.players.length === 1) return `<p class="muted small">Speler op deze telefoon: <b>${esc(player()?.name)}</b></p>`;
  return `<label class="field">Speler op deze telefoon<select id="player">${data.players.map(p =>
    `<option value="${esc(p.id)}"${p.id === state.playerId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
}
function shareChoices(current = null, legend = 'Wat deel je met deze groep?') {
  return `<fieldset class="choices"><legend>${esc(legend)}</legend>` + Object.entries(SHARE_LABELS).map(([k, [t, d]]) =>
    `<label class="check"><input type="checkbox" name="share-${k}"${current?.[k] ? ' checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('') +
    '<p class="help">Losse pijlen, tijdstippen en je volledige trainingsgeschiedenis blijven altijd op je telefoon. Je kunt dit later aanpassen of stoppen.</p></fieldset>';
}
const readShare = form => Object.fromEntries(Object.keys(SHARE_LABELS).map(k => [k, !!form.elements['share-' + k]?.checked]));

function unavailable() {
  $('#vr').innerHTML = `<section class="card"><h2>Binnenkort beschikbaar</h2>
    <p>Met <b>Mijn vrienden</b> maak je straks een besloten groep, nodig je vrienden uit met een link en vergelijk je gemiddelden, records en de weekchallenge.</p>
    <p class="muted">We zetten dit pas aan als de privacyafspraken en de toestemming van ouders voor spelers onder 16 goed geregeld zijn. Trainen in OKKIE. werkt gewoon, zonder account en zonder internet.</p>
    <a class="btn primary" href="../">Verder trainen</a></section>`;
}

// Nog geen online profiel voor deze speler: alleen via uitnodiging (of oprichterscode) een besloten profiel maken.
function join() {
  const inv = state.invite;
  const nick = player()?.name?.slice(0, 24) || '';
  $('#vr').innerHTML = `${playerPicker()}
    ${inv ? `<section class="card"><span class="tag shared">Uitnodiging</span><h2>Doe mee met “${esc(inv.group.name)}”</h2>
      <p class="muted">${inv.group.members} ${inv.group.members === 1 ? 'lid' : 'leden'} · link geldig tot ${esc(inv.expiresAt)}. Je ziet de scores pas als je lid bent.</p></section>` :
      `<section class="card"><h2>Je hebt een uitnodiging nodig</h2><p>Groepen zijn besloten. Vraag een vriend om een uitnodigingslink, of maak zelf een groep als je een oprichterscode hebt.</p></section>`}
    <form id="register" class="card" novalidate>
      <h2>${inv ? 'Maak je groepsprofiel' : 'Groep oprichten'}</h2>
      <label class="field">Je nickname in de groep<input name="nickname" minlength="2" maxlength="24" required autocomplete="nickname" value="${esc(nick)}"></label>
      <p class="help">Gebruik bij voorkeur een bijnaam of alleen je voornaam. Dit profiel is alleen zichtbaar voor leden van jouw groepen, niet openbaar.</p>
      ${inv ? '' : '<label class="field">Oprichterscode<input name="founder" required autocomplete="off"></label>'}
      <fieldset class="choices"><legend>Hoe oud ben je?</legend>
        <label class="check"><input type="radio" name="age" value="adult" required><span><b>16 jaar of ouder</b></span></label>
        <label class="check"><input type="radio" name="age" value="minor"><span><b>Jonger dan 16</b><small>Dan moet een ouder of verzorger eerst toestemming geven. Dat kan nog niet in OKKIE.; je kunt wel gewoon trainen.</small></span></label>
      </fieldset>
      ${inv ? shareChoices() : shareChoices(null, 'Wat deel je met je nieuwe groep?')}
      ${inv ? '' : '<label class="field">Naam van je groep<input name="group" minlength="2" maxlength="40" required placeholder="Bijv. Dartvrienden"></label>'}
      <button class="btn primary" type="submit">${inv ? 'Doe mee' : 'Maak mijn groep'}</button>
    </form>
    <details class="card"><summary><b>Heb je al een profiel? Herstellen</b></summary>
      <form id="recover"><label class="field">Profielcode (12 tekens)<input name="handle" minlength="12" maxlength="12" required autocomplete="off"></label>
      <label class="field">Herstelcode<input name="recovery" minlength="64" maxlength="64" required autocomplete="off"></label>
      <button class="btn outline" type="submit">Profiel herstellen</button></form></details>`;
  focusView();
}

async function afterAccount(account, body) {
  upsertAccount(state.playerId, { id: account.account.id, handle: account.account.handle, nickname: account.account.nickname,
    token: account.token, recovery: account.recovery, enabled: true, groupsOnly: true, createdAt: new Date().toISOString() });
  try { await syncAccount(localData(), state.playerId); } catch { /* cijfers volgen bij de volgende training */ }
  return body;
}

function groupsList() {
  const a = acct();
  const groups = state.groups || [];
  $('#vr').innerHTML = `${playerPicker()}
    ${state.invite ? `<form id="accept" class="card"><span class="tag shared">Uitnodiging</span><h2>Doe mee met “${esc(state.invite.group.name)}”</h2>
      <p class="muted">${state.invite.group.members} leden · je ziet hun scores zodra je lid bent.</p>${shareChoices()}
      <div class="row"><button class="btn primary" type="submit">Doe mee</button><button class="btn outline" type="button" data-act="skip-invite">Niet nu</button></div></form>` : ''}
    <section class="card"><div class="g-head"><div><h2>Mijn groepen</h2><p class="muted small">Ingelogd als <b>${esc(a.nickname)}</b> · alleen zichtbaar voor je groepsleden</p></div></div>
      ${groups.length ? `<div class="groups">${groups.map(g => `<button class="group-card" type="button" data-open="${esc(g.id)}"><b>${esc(g.name)}</b>
        <span>${g.members} ${g.members === 1 ? 'lid' : 'leden'} · ${g.role === 'owner' ? 'eigenaar' : g.role === 'admin' ? 'beheerder' : 'lid'}</span></button>`).join('')}</div>` :
        '<p class="muted">Je zit nog in geen enkele groep. Maak er een of vraag om een uitnodigingslink.</p>'}
    </section>
    <form id="create" class="card"><h2>Nieuwe groep</h2>
      <label class="field">Groepsnaam<input name="name" minlength="2" maxlength="40" required placeholder="Bijv. Café De Pijl"></label>
      ${shareChoices(null, 'Wat deel je met deze groep?')}<button class="btn primary" type="submit">Maak groep</button></form>
    ${myShared()}`;
  animate($('#vr'));
  focusView();
}

// Duidelijk onderscheid: eigen scores (alleen op deze telefoon) tegenover wat online gedeeld is.
function myShared() {
  const snaps = data ? publicSnapshots(data, state.playerId) : [];
  const all = snaps.find(s => s.period === 'all');
  return `<section class="card"><h2>Mijn gegevens</h2><div class="mine-vs">
    <div class="card"><span class="tag private">Op deze telefoon</span><h3>Eigen scores</h3>
      <p>${all ? `${all.sessions} scoretrainingen · gemiddelde <b>${fmt(avg3(all.points, all.darts))}</b>` : 'Nog geen afgeronde scoretraining.'}</p>
      <p class="help">Alles, inclusief losse pijlen. Blijft altijd hier.</p></div>
    <div class="card"><span class="tag shared">Gedeeld</span><h3>Met je groepen</h3>
      <p>Alleen samenvattingen, per groep zelf gekozen. ${acct()?.lastSync ? 'Laatst bijgewerkt ' + esc(new Date(acct().lastSync).toLocaleString('nl-NL')) + '.' : ''}</p>
      <div class="row"><button class="btn outline" type="button" data-act="sync">Nu bijwerken</button></div></div></div>
    <details><summary><b>Delen stoppen of profiel verwijderen</b></summary>
      <p class="help">“Delen stoppen” wist al je gedeelde cijfers online en stopt het bijwerken; je blijft lid. “Profiel verwijderen” haalt je uit alle groepen en wist alles online. Je trainingen op deze telefoon blijven altijd bewaard.</p>
      <div class="row"><button class="btn outline" type="button" data-act="stop-sharing">Delen stoppen</button>
      <button class="btn danger" type="button" data-act="delete-account">Profiel verwijderen</button></div>
      <p class="help">Herstelgegevens (bewaar ze privé): profiel <b>${esc(acct()?.handle)}</b>${acct()?.recovery ? ' · herstelcode <code>' + esc(acct().recovery) + '</code>' : ''}</p></details></section>`;
}

// ---------- groepsdashboard ----------
function boardHtml(list, value, unit = '', key) {
  const prev = prefs().places?.[state.group.group.id]?.[key] || {};
  const moves = movement(list.ranked, prev);
  if (!list.ranked.length) return '<p class="muted">Nog niemand op deze lijst. Gooi een training en wees de eerste!</p>' + waitingHtml(list);
  return `<ol class="board">${list.ranked.map(r => {
    const mv = moves[r.handle];
    return `<li class="${r.you ? 'you' : ''}"><span class="place" aria-label="Plaats ${r.place}">${r.place}</span>
      <span class="who"><b>${esc(r.nickname)}${r.you ? ' (jij)' : ''}${mv > 0 ? `<span class="move up" aria-label="${mv} plaats${mv > 1 ? 'en' : ''} gestegen">▲${mv}</span>` : mv < 0 ? `<span class="move down" aria-label="${-mv} plaats${mv < -1 ? 'en' : ''} gezakt">▼${-mv}</span>` : ''}
      ${r.recordThisWeek && key !== 'improvement' ? '<span class="badge record">record!</span>' : ''}</b>
      <small>${key === 'week' ? `${r.weekTrainings} ${r.weekTrainings === 1 ? 'training' : 'trainingen'} deze week` : `${r.trainings} trainingen`}</small></span><span class="val">${value(r)}${unit}</span></li>`;
  }).join('')}</ol>${waitingHtml(list)}`;
}
function waitingHtml(list) {
  return list.waiting.length ? `<p class="waiting">Nog niet op deze lijst (te weinig pijlen of niet gedeeld): ${list.waiting.map(r => esc(r.nickname)).join(', ')}.</p>` : '';
}
function rememberPlaces(b) {
  const p = prefs();
  p.places = p.places || {};
  p.places[state.group.group.id] = { overall: placesOf(b.overall.ranked), week: placesOf(b.week.ranked), challenge: placesOf(b.challenge.ranked) };
  savePrefs(p);
}

function highlights(b) {
  const top = b.week.ranked[0], imp = b.improvement.ranked.find(r => r.value > 0), ch = b.challenge.ranked[0];
  const rec = b.rows.filter(r => r.recordThisWeek);
  const card = (label, row, num, extra = '') => `<div class="hl${row ? '' : ' empty'}"><small>${label}</small>${row ? `<b>${esc(row.nickname)}</b><span class="num">${num}</span>${extra}` : `<b>${num}</b>`}</div>`;
  return `<div class="highlights">
    ${card('Beste deze week', top, top ? fmt(top.value) : 'Nog niemand met 30 pijlen deze week')}
    ${card('Meest verbeterd', imp, imp ? '+' + fmt(imp.value) : 'Nog geen vergelijking met vorige weken')}
    ${card('30-pijlenchallenge', ch, ch ? ch.value + ' pt' : 'Nog geen challenge deze week')}
    ${card('Record deze week', rec.length ? { nickname: rec.slice(0, 3).map(r => r.nickname).join(', ') + (rec.length > 3 ? ' en meer' : '') } : null,
      rec.length ? `${rec.length} ${rec.length === 1 ? 'speler' : 'spelers'}` : 'Nog geen nieuw record')}
  </div>`;
}

function compareHtml(b) {
  const rows = b.rows;
  if (!state.compare.length) state.compare = [rows.find(r => r.you), ...b.overall.ranked.filter(r => !r.you)].filter(Boolean).slice(0, 2).map(r => r.handle);
  const chosen = state.compare.map(h => rows.find(r => r.handle === h)).filter(Boolean);
  const metrics = [
    ['Gemiddelde (alle tijden)', r => r.averageEligible ? r.average : null, 2, `minstens ${MIN_DARTS_ALL} pijlen`],
    ['Gemiddelde deze week', r => r.weekAverage, 2, `minstens ${MIN_DARTS_WEEK} pijlen`],
    ['Beste 30 pijlen', r => r.best30, 2], ['Beste 60 pijlen', r => r.best60, 2], ['Beste 99 pijlen', r => r.best99, 2],
    ['Hoogste beurt', r => r.highestTurn || null, 0], ['Trainingen', r => r.trainings || null, 0],
  ];
  const bars = metrics.map(([label, get, d, note]) => {
    const vals = chosen.map(get), max = Math.max(...vals.filter(v => v != null), 1);
    return `<div class="cmp-row"><h4>${label}</h4>${chosen.map((r, i) => vals[i] == null ?
      `<div class="cbar"><span>${esc(r.nickname)}</span><span class="track"></span><span class="v nv">${note ? 'te weinig' : 'n.v.t.'}</span></div>` :
      `<div class="cbar"><span>${esc(r.nickname)}</span><span class="track"><span class="fill" style="background:${COLORS[i]};transform:scaleX(${(vals[i] / max).toFixed(3)})"></span></span><span class="v">${fmt(vals[i], d)}</span></div>`).join('')}</div>`;
  }).join('');
  return `<p class="muted small">Kies maximaal 4 spelers. Alleen gelijkwaardige cijfers worden naast elkaar gezet; “te weinig” betekent onvoldoende pijlen.</p>
    <div class="pick" role="group" aria-label="Spelers om te vergelijken">${rows.map(r => {
      const i = state.compare.indexOf(r.handle);
      return `<button type="button" data-cmp="${esc(r.handle)}" aria-pressed="${i >= 0}">${i >= 0 ? `<span class="dot" style="background:${COLORS[i]}"></span>` : ''}${esc(r.nickname)}</button>`;
    }).join('')}</div>
    <div class="cmp">${bars}<div class="cmp-row trend"><h4>Gemiddelde per week (laatste 8 weken)</h4>${trendSvg(chosen)}</div></div>`;
}
function trendSvg(chosen) {
  const weeks = [...new Set(chosen.flatMap(r => r.trend.map(t => t.week)))].sort().slice(-8);
  if (weeks.length < 2) return '<p class="muted small">Na twee weken met trainingen verschijnt hier een lijn.</p>';
  const vals = chosen.flatMap(r => r.trend.map(t => t.average)).filter(v => v != null);
  const lo = Math.max(0, Math.min(...vals) - 5), hi = Math.max(...vals) + 5;
  const W = 320, H = 150, x = i => 24 + i * (W - 34) / (weeks.length - 1), y = v => H - 18 - (v - lo) / (hi - lo || 1) * (H - 32);
  const lines = chosen.map((r, i) => {
    const pts = weeks.map((w, j) => { const t = r.trend.find(t => t.week === w); return t?.average != null ? [x(j), y(t.average)] : null; }).filter(Boolean);
    return pts.length ? `<polyline fill="none" stroke="${COLORS[i]}" stroke-width="3" stroke-linejoin="round" points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}"/>` +
      pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${COLORS[i]}"/>`).join('') : '';
  }).join('');
  const labels = weeks.map((w, j) => `<text x="${x(j).toFixed(1)}" y="${H - 3}" font-size="9" fill="#95ab9e" text-anchor="middle">${w.slice(8)}-${w.slice(5, 7)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekgemiddelden van ${chosen.map(r => esc(r.nickname)).join(', ')}">
    <text x="2" y="12" font-size="9" fill="#95ab9e">${fmt(hi, 0)}</text><text x="2" y="${H - 18}" font-size="9" fill="#95ab9e">${fmt(lo, 0)}</text>${lines}${labels}</svg>
    <div class="legend">${chosen.map((r, i) => `<span><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLORS[i]}"></span> ${esc(r.nickname)}</span>`).join('')}</div>`;
}

function membersHtml() {
  const g = state.group, admin = g.group.role !== 'member', owner = g.group.role === 'owner';
  return `<ol class="board members">${g.members.map(m => `<li><span class="who"><b>${esc(m.nickname)}${m.you ? ' (jij)' : ''}</b>
      <small>${m.role === 'owner' ? 'eigenaar' : m.role === 'admin' ? 'beheerder' : 'lid'} · deelt: ${Object.entries(m.share).filter(([, v]) => v).map(([k]) => SHARE_LABELS[k][0].toLowerCase()).join(', ') || 'niets'}</small></span>
      <span class="row">${!m.you && admin && m.role !== 'owner' && (owner || m.role === 'member') ? `<button class="btn outline" type="button" data-remove="${esc(m.handle)}" aria-label="${esc(m.nickname)} uit de groep halen">Verwijderen</button>` : ''}
      ${!m.you && owner && m.role !== 'owner' ? `<button class="btn outline" type="button" data-role="${esc(m.handle)}" data-to="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'Geen beheerder' : 'Maak beheerder'}</button>` : ''}</span></li>`).join('')}</ol>
    ${admin ? `<div class="card"><h3>Vrienden uitnodigen</h3><p class="help">Een link is persoonlijk voor deze groep. Wie hem krijgt, kan pas meekijken na het aanmaken van een profiel en een bewuste deelkeuze. Je kunt links altijd intrekken.</p>
      <form id="invite" class="row"><label class="field">Geldig<select name="days"><option value="1">1 dag</option><option value="7" selected>7 dagen</option><option value="30">30 dagen</option></select></label>
      <label class="field">Voor<select name="uses"><option value="1">1 persoon</option><option value="10">10 personen</option><option value="30" selected>30 personen</option></select></label>
      <button class="btn primary" type="submit">Maak uitnodigingslink</button></form><div id="invite-out"></div><div id="invites"></div></div>` : ''}`;
}
function settingsHtml() {
  const g = state.group, me = g.members.find(m => m.you), owner = g.group.role === 'owner';
  return `<form id="share" class="card"><h3>Wat ik deel met ${esc(g.group.name)}</h3>${shareChoices(me?.share, 'Je keuze voor deze groep')}
      <button class="btn primary" type="submit">Opslaan</button></form>
    ${g.group.role !== 'member' ? `<form id="rename" class="card"><h3>Groepsnaam</h3><label class="field">Naam<input name="name" value="${esc(g.group.name)}" minlength="2" maxlength="40" required></label><button class="btn outline" type="submit">Naam wijzigen</button></form>` : ''}
    <div class="card"><h3>Groep verlaten</h3><p class="help">${owner ? 'Je bent eigenaar: bij verlaten gaat het eigenaarschap naar een beheerder of het langst aanwezige lid. Ben je de laatste, dan verdwijnt de groep.' : 'Je gedeelde cijfers zijn daarna niet meer zichtbaar voor deze groep.'}</p>
      <div class="row"><button class="btn outline" type="button" data-act="leave">Groep verlaten</button>${owner ? '<button class="btn danger" type="button" data-act="delete-group">Groep opheffen</button>' : ''}</div></div>`;
}

function groupView() {
  const g = state.group;
  const b = leaderboards(g.members, g.week);
  const tabs = [['week', 'Deze week'], ['ranks', 'Ranglijsten'], ['compare', 'Vergelijken'], ['members', 'Leden'], ['settings', 'Mijn deelkeuze']];
  let body = '';
  if (state.tab === 'week') {
    body = highlights(b) + `<section class="card"><h3>Weekranglijst</h3><p class="help">Gemiddelde per 3 pijlen deze week (vanaf maandag), minimaal ${MIN_DARTS_WEEK} pijlen.</p>${boardHtml(b.week, r => fmt(r.value), '', 'week')}</section>
      <section class="card"><h3>Recente verbeteringen</h3><p class="help">Gemiddelde deze week tegenover de weken ervoor (beide minstens ${MIN_DARTS_WEEK} pijlen). Zo telt vooruitgang, ook als je net begint.</p>${boardHtml(b.improvement, r => (r.value > 0 ? '+' : '') + fmt(r.value), '', 'improvement')}</section>`;
  } else if (state.tab === 'ranks') {
    const lists = { overall: ['Algemeen', b.overall, r => fmt(r.value), `Gemiddelde per 3 pijlen over alle gedeelde trainingen, minimaal ${MIN_DARTS_ALL} pijlen.`],
      week: ['Week', b.week, r => fmt(r.value), `Deze week, minimaal ${MIN_DARTS_WEEK} pijlen.`],
      challenge: ['30-pijlenchallenge', b.challenge, r => r.value + ' pt', 'Je eerste afgeronde 30-pijlentraining van deze week telt. Iedereen gooit dezelfde opdracht.'],
      records: ['Records', null] };
    const [label, list, val, help] = lists[state.board];
    let content;
    if (state.board === 'records') {
      const recs = { best30: ['Beste 30 pijlen', r => fmt(r.value)], best60: ['Beste 60 pijlen', r => fmt(r.value)], best99: ['Beste 99 pijlen', r => fmt(r.value)],
        highestTurn: ['Hoogste beurt', r => r.value], hits180: ['Aantal 180’s', r => r.value] };
      content = `<div class="seg" role="group" aria-label="Soort record">${Object.entries(recs).map(([k, [t]]) => `<button type="button" data-rec="${k}" aria-pressed="${state.records === k}">${t}</button>`).join('')}</div>
        <p class="help">Persoonlijke records uit gedeelde trainingen. “Beste 30/60/99” is het hoogste gemiddelde per 3 pijlen in één training van precies zoveel pijlen.</p>
        ${boardHtml(b.records[state.records], recs[state.records][1], '', 'rec-' + state.records)}`;
    } else content = `<p class="help">${help}</p>${boardHtml(list, val, '', state.board)}`;
    body = `<section class="card"><div class="seg" role="group" aria-label="Ranglijst">${Object.entries(lists).map(([k, [t]]) =>
      `<button type="button" data-board="${k}" aria-pressed="${state.board === k}">${t}</button>`).join('')}</div><h3>${label}</h3>${content}</section>`;
  } else if (state.tab === 'compare') body = `<section class="card"><h3>Spelers vergelijken</h3>${compareHtml(b)}</section>`;
  else if (state.tab === 'members') body = `<section class="card"><h3>Leden (${g.members.length})</h3>${membersHtml()}</section>`;
  else body = settingsHtml();
  $('#vr').innerHTML = `<button class="back" type="button" data-act="groups">← Mijn groepen</button>
    <div class="g-head"><div><span class="tag shared">Besloten groep</span><h2>${esc(g.group.name)}</h2>
      <p class="muted small">${g.members.length} leden · week van ${esc(g.week)} · alleen leden zien dit</p></div></div>
    <div class="tabs" role="tablist" aria-label="Onderdelen">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${t}</button>`).join('')}</div>
    <div role="tabpanel">${body}</div>`;
  animate($('#vr'));
  if (state.tab === 'week' || state.tab === 'ranks') rememberPlaces(b);
  if (state.tab === 'members' && g.group.role !== 'member') loadInvites();
}

async function loadInvites() {
  const out = $('#invites');
  if (!out) return;
  try {
    const { invites } = await api(`/v1/groups/${state.group.group.id}/invites`);
    const open = invites.filter(i => i.active);
    out.innerHTML = open.length ? `<h4>Open uitnodigingen</h4><ol class="board">${open.map(i => `<li><span class="who"><b>Link van ${esc(i.createdAt.slice(0, 10))}</b>
      <small>${i.uses}/${i.maxUses} gebruikt · geldig tot ${esc(i.expiresAt.slice(0, 10))}</small></span><span></span>
      <button class="btn outline" type="button" data-revoke="${esc(i.id)}">Intrekken</button></li>`).join('')}</ol>` : '<p class="help">Geen open uitnodigingen.</p>';
  } catch (e) { out.innerHTML = `<p class="help">${esc(e.message)}</p>`; }
}

// ---------- laden ----------
async function loadGroups() {
  state.groups = (await api('/v1/groups')).groups;
  const last = prefs().lastGroup;
  return last && state.groups.some(g => g.id === last) ? last : null;
}
async function openGroup(id, tab = 'week') {
  state.group = await api('/v1/groups/' + id);
  state.tab = tab; state.compare = [];
  const p = prefs(); p.lastGroup = id; savePrefs(p);
  groupView();
  focusView();
}
async function render() {
  data = localData();
  if (!GROUPS_OPEN || !apiAvailable()) return unavailable();
  if (!data?.players?.length) {
    $('#vr').innerHTML = '<section class="card"><h2>Maak eerst je speler aan</h2><p>Open de app, kies je naam en gooi je eerste training. Kom daarna terug.</p><a class="btn primary" href="../">Naar de app</a></section>';
    return;
  }
  try {
    if (state.inviteToken && !state.invite) state.invite = await api('/v1/invites/preview', 'POST', { token: state.inviteToken }, false);
  } catch (e) { status(e.message, true); state.inviteToken = ''; }
  if (!acct()) return join();
  try {
    const last = await loadGroups();
    if (last && !state.invite) return openGroup(last, state.tab);
    groupsList();
  } catch (e) {
    if (/Niet ingelogd/.test(e.message)) { status('Dit profiel is niet meer geldig op deze telefoon. Herstel het met je herstelcode of maak een nieuw profiel via een uitnodiging.', true); dropAccount(state.playerId); return join(); }
    status(e.message, true);
    $('#vr').innerHTML = `<section class="card"><h2>Even geen verbinding</h2><p>${esc(e.message)}</p><button class="btn primary" type="button" data-act="retry">Opnieuw proberen</button></section>`;
  }
}

// ---------- interactie ----------
document.addEventListener('change', e => {
  if (e.target.id === 'player') {
    state.playerId = e.target.value; state.group = null;
    const p = prefs(); p.playerId = state.playerId; delete p.lastGroup; savePrefs(p);
    status(); render();
  }
});
document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  const btn = f.querySelector('[type=submit]');
  status();
  if (f.id === 'register') return busy(btn, async () => {
    const age = f.elements.age.value, nickname = f.elements.nickname.value.trim(), share = readShare(f);
    if (!age) throw new Error('Kies je leeftijdsgroep.');
    if (age === 'minor') throw new Error('Voor spelers jonger dan 16 moet een ouder of verzorger eerst toestemming geven. Dat kan nog niet in OKKIE. Je kunt wel gewoon trainen.');
    if (!Object.values(share).some(Boolean)) throw new Error('Kies minstens één ding om te delen, anders kan de groep je niet zien.');
    if (state.invite) {
      const account = await api('/v1/register', 'POST', { nickname, inviteToken: state.inviteToken, age }, false);
      await afterAccount(account);
      const r = await api('/v1/invites/accept', 'POST', { token: state.inviteToken, share });
      state.invite = null; state.inviteToken = '';
      status(`Welkom bij ${r.group.name}!`);
      return openGroup(r.group.id);
    }
    const name = f.elements.group.value.trim();
    const account = await api('/v1/register', 'POST', { nickname, founderCode: f.elements.founder.value.trim(), age }, false);
    await afterAccount(account);
    const { group } = await api('/v1/groups', 'POST', { name, share });
    status(`Groep ${group.name} is gemaakt. Nodig nu je vrienden uit.`);
    return openGroup(group.id, 'members');
  });
  if (f.id === 'recover') return busy(btn, async () => {
    const r = await api('/v1/recover', 'POST', { handle: f.elements.handle.value.trim(), recovery: f.elements.recovery.value.trim() }, false);
    upsertAccount(state.playerId, { id: r.account.id, handle: r.account.handle, nickname: r.account.nickname, token: r.token, recovery: r.recovery, enabled: true, groupsOnly: !r.enabled });
    status('Profiel hersteld op deze telefoon.');
    render();
  });
  if (f.id === 'accept') return busy(btn, async () => {
    const share = readShare(f);
    if (!Object.values(share).some(Boolean)) throw new Error('Kies minstens één ding om te delen.');
    const r = await api('/v1/invites/accept', 'POST', { token: state.inviteToken, share });
    state.invite = null; state.inviteToken = '';
    try { await syncAccount(localData(), state.playerId); } catch { /* later */ }
    status(r.already ? `Je was al lid van ${r.group.name}.` : `Welkom bij ${r.group.name}!`);
    openGroup(r.group.id);
  });
  if (f.id === 'create') return busy(btn, async () => {
    const share = readShare(f);
    if (!Object.values(share).some(Boolean)) throw new Error('Kies minstens één ding om te delen met je groep.');
    const { group } = await api('/v1/groups', 'POST', { name: f.elements.name.value.trim(), share });
    try { await syncAccount(localData(), state.playerId); } catch { /* later */ }
    status(`Groep ${group.name} is gemaakt. Nodig nu je vrienden uit.`);
    openGroup(group.id, 'members');
  });
  if (f.id === 'invite') return busy(btn, async () => {
    const { invite } = await api(`/v1/groups/${state.group.group.id}/invites`, 'POST', { days: +f.elements.days.value, maxUses: +f.elements.uses.value });
    const url = new URL('./', location.href).href + '#uitnodiging=' + invite.token;
    const text = `Doe mee met onze dartgroep "${state.group.group.name}" in OKKIE.!`;
    $('#invite-out').innerHTML = `<span class="invite-link" data-testid="invite-link">${esc(url)}</span>
      <div class="row">${navigator.share ? '<button class="btn primary" type="button" data-act="share-invite">Delen…</button>' : ''}
      <a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}">WhatsApp</a>
      <button class="btn outline" type="button" data-act="copy-invite">Kopieer link</button></div>
      <p class="help">Deze link zie je maar één keer. Deel hem alleen met mensen die je in de groep wilt.</p>`;
    $('#invite-out').dataset.url = url; $('#invite-out').dataset.text = text;
    loadInvites();
  });
  if (f.id === 'share') return busy(btn, async () => {
    await api(`/v1/groups/${state.group.group.id}/me`, 'PATCH', { share: readShare(f) });
    status('Je deelkeuze is opgeslagen.');
    openGroup(state.group.group.id, 'settings');
  });
  if (f.id === 'rename') return busy(btn, async () => {
    await api(`/v1/groups/${state.group.group.id}`, 'PATCH', { name: f.elements.name.value.trim() });
    status('Groepsnaam gewijzigd.');
    openGroup(state.group.group.id, 'settings');
  });
});
document.addEventListener('click', e => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;
  if (d.open) return busy(t, () => openGroup(d.open));
  if (d.tab) { state.tab = d.tab; groupView(); return $(`[data-tab="${d.tab}"]`)?.focus(); }
  if (d.board) { state.board = d.board; groupView(); return $(`[data-board="${d.board}"]`)?.focus(); }
  if (d.rec) { state.records = d.rec; groupView(); return $(`[data-rec="${d.rec}"]`)?.focus(); }
  if (d.cmp) {
    const i = state.compare.indexOf(d.cmp);
    if (i >= 0) state.compare.splice(i, 1); else if (state.compare.length < 4) state.compare.push(d.cmp); else status('Je kunt maximaal 4 spelers tegelijk vergelijken.');
    groupView(); return $(`[data-cmp="${d.cmp}"]`)?.focus();
  }
  if (d.revoke) return busy(t, async () => { await api(`/v1/groups/${state.group.group.id}/invites/${d.revoke}`, 'DELETE'); status('Uitnodiging ingetrokken: de link werkt niet meer.'); loadInvites(); });
  if (d.remove) return busy(t, async () => {
    if (!confirm('Dit lid uit de groep halen?')) return;
    await api(`/v1/groups/${state.group.group.id}/members/${d.remove}`, 'DELETE'); status('Lid verwijderd.'); openGroup(state.group.group.id, 'members');
  });
  if (d.role) return busy(t, async () => { await api(`/v1/groups/${state.group.group.id}/members/${d.role}`, 'PATCH', { role: d.to }); openGroup(state.group.group.id, 'members'); });
  const act = d.act;
  if (!act) return;
  if (act === 'groups') return busy(t, async () => { const p = prefs(); delete p.lastGroup; savePrefs(p); state.group = null; await loadGroups(); groupsList(); });
  if (act === 'retry' || act === 'skip-invite') { if (act === 'skip-invite') { state.invite = null; state.inviteToken = ''; } status(); return render(); }
  if (act === 'sync') return busy(t, async () => { await syncAccount(localData(), state.playerId); status('Je gedeelde cijfers zijn bijgewerkt.'); groupsList(); });
  if (act === 'share-invite') return navigator.share({ title: 'OKKIE.', text: $('#invite-out').dataset.text, url: $('#invite-out').dataset.url }).catch(() => {});
  if (act === 'copy-invite') return navigator.clipboard.writeText($('#invite-out').dataset.url).then(() => status('Link gekopieerd.'), () => status('Kopiëren lukt hier niet; selecteer de link hierboven.', true));
  if (act === 'leave') return busy(t, async () => {
    if (!confirm('Weet je zeker dat je deze groep verlaat?')) return;
    await api(`/v1/groups/${state.group.group.id}/me`, 'DELETE');
    const p = prefs(); delete p.lastGroup; savePrefs(p); state.group = null;
    status('Je hebt de groep verlaten.'); await loadGroups(); groupsList();
  });
  if (act === 'delete-group') return busy(t, async () => {
    if (!confirm('De groep opheffen voor iedereen? Dit kan niet ongedaan worden gemaakt.')) return;
    await api(`/v1/groups/${state.group.group.id}`, 'DELETE');
    const p = prefs(); delete p.lastGroup; savePrefs(p); state.group = null;
    status('De groep is opgeheven.'); await loadGroups(); groupsList();
  });
  if (act === 'stop-sharing') return busy(t, async () => {
    if (!confirm('Al je gedeelde cijfers online wissen en het bijwerken stoppen? Je trainingen op deze telefoon blijven bewaard.')) return;
    await api('/v1/me/snapshots', 'DELETE');
    upsertAccount(state.playerId, { ...acct(), enabled: false });
    status('Delen gestopt: je gedeelde cijfers zijn gewist. Je blijft lid; zet delen weer aan met “Nu bijwerken”.');
    groupsList();
  });
  if (act === 'delete-account') return busy(t, async () => {
    if (!confirm('Je online profiel verwijderen en uit al je groepen gaan? Je trainingen op deze telefoon blijven bewaard.')) return;
    await api('/v1/me', 'DELETE');
    dropAccount(state.playerId);
    status('Je online profiel is verwijderd. Je trainingen staan nog gewoon op je telefoon.');
    render();
  });
});
// "Nu bijwerken" zet delen weer aan na "Delen stoppen".
document.addEventListener('click', e => {
  if (e.target.closest('[data-act="sync"]') && acct() && !acct().enabled) upsertAccount(state.playerId, { ...acct(), enabled: true });
}, true);
addEventListener('online', () => status());
render();
