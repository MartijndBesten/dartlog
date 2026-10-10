// OCHE — interface. Spelregels staan in logic.js, opslag in store.js.
import * as L from './logic.js';
import * as S from './store.js';
import { boardSVG, heatLegend } from './board.js';
import { lineChart, bindChart } from './chart.js';
import { BADGES, earnedBadges } from './achievements.js';
import { logoSVG } from './brand.js';

export const APP_VERSION = '1.0.0';

const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const int = n => Number(n || 0).toLocaleString('nl-NL');
const dateLabel = iso => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
const dateTime = iso => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const now = () => new Date().toISOString();

const store = S.createStore(window.localStorage);
const loaded = store.load();
let data = loaded.data;
sanitizeActive();

const ui = {
  view: 'home',
  mod: 1, // 1 enkel, 2 dubbel, 3 triple
  typing: false,
  statsFilter: 'all',
  statsPeriod: 'training',
  statsLast10: false,
  heatMode: 'all',
  lastTap: 0,
  result: null,
  setup: { kind: 'score', turns: 10, custom: 15 },
  match: { start: 501, bestOf: 3, doubleOut: true, players: [] },
  installEvent: null,
};

// ---------- Hulpjes ----------
function save() {
  if (!store.save(data)) toast('Opslaan lukt niet! Maak een back-up via Meer → Back-up.', 'error');
}

function sanitizeActive() {
  const a = data.active || {};
  const okTraining = a.training && Array.isArray(a.training.turns) && Array.isArray(a.training.pending);
  const okMatch = a.match && Array.isArray(a.match.legs) && a.match.legs.length && Array.isArray(a.match.pending);
  data.active = { training: okTraining ? a.training : null, match: okMatch ? a.match : null };
  if (data.activePlayerId && !data.players.some(p => p.id === data.activePlayerId)) data.activePlayerId = data.players[0]?.id || null;
}

function player(id = data.activePlayerId) {
  return data.players.find(p => p.id === id) || null;
}

function myTrainings(kind) {
  return data.trainings
    .filter(t => t.playerId === data.activePlayerId && (!kind || t.kind === kind))
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

function myMatches() {
  return data.matches
    .filter(m => m.players.some(p => p.id === data.activePlayerId))
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

function trainingTitle(t) {
  if (t.kind === 'clock') return 'Rond de klok';
  return t.limitTurns ? `Scoretraining ${t.limitTurns * 3} pijlen` : 'Vrije scoretraining';
}

function filterKey(t) {
  return t.limitTurns ? String(t.limitTurns * 3) : 'vrij';
}

function overview(playerId = data.activePlayerId) {
  const ts = data.trainings.filter(t => t.playerId === playerId && t.kind === 'score');
  let points = 0, darts = 0, high = 0, best = null, tons = 0, t140 = 0, t180 = 0;
  for (const t of ts) {
    const tot = L.trainingTotals(t);
    points += tot.points; darts += tot.darts;
    high = Math.max(high, tot.high ?? 0);
    tons += tot.tons; t140 += tot.t140; t180 += tot.t180;
    if (tot.darts >= 30 && (!best || tot.avg > best.avg)) best = { avg: tot.avg, t };
  }
  const all = data.trainings.filter(t => t.playerId === playerId);
  return {
    count: all.length,
    avg: L.avg3(points, darts),
    darts,
    high,
    best,
    tons, t140, t180,
    streak: L.dayStreak(all.map(t => t.startedAt)),
  };
}

function haptic(ms = 12) {
  if (data.settings.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* niet ondersteund */ }
}

let audioCtx = null;
function beep(kind) {
  if (!data.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { tap: [880], ton: [660, 880], max: [523, 659, 784, 1047], bust: [220, 160], win: [523, 784, 1047] }[kind] || [880];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = kind === 'bust' ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      const t0 = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.04 : 0.12, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'tap' ? 0.06 : 0.22));
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.25);
    });
  } catch { /* geen geluid beschikbaar */ }
}

let toastTimer;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
}

// Grote viering over het scherm heen (TON!, 180, BUST, GAME SHOT).
function celebrate(big, small = '', kind = 'ton') {
  const el = $('#celebrate');
  el.innerHTML = `<div class="cel-inner ${kind}"><div class="cel-big">${esc(big)}</div>${small ? `<div class="cel-small">${esc(small)}</div>` : ''}</div>`;
  if (kind === 'max' || kind === 'win') {
    const colors = ['#3ddc84', '#ff4d4f', '#ffc53d', '#f3eedf', '#b8ff3c'];
    el.insertAdjacentHTML('beforeend', Array.from({ length: 40 }, (_, i) =>
      `<i class="confetti" style="left:${Math.random() * 100}%;background:${colors[i % 5]};animation-delay:${Math.random() * 0.4}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join(''));
  }
  el.className = 'celebrate show';
  clearTimeout(celebrate.t);
  celebrate.t = setTimeout(() => (el.className = 'celebrate'), kind === 'max' || kind === 'win' ? 2200 : 1100);
}

function turnCelebration(score) {
  if (score === 180) { celebrate('180!', 'ONE HUNDRED AND EIGHTY', 'max'); beep('max'); haptic([40, 40, 40, 40, 120]); }
  else if (score >= 140) { celebrate(String(score), 'TON-FORTY!', 'ton'); beep('ton'); haptic(60); }
  else if (score >= 100) { celebrate(String(score), 'TON!', 'ton'); beep('ton'); haptic(40); }
}

// ---------- Modal ----------
function modal(html, { onClose } = {}) {
  const el = $('#modal');
  el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
  el.hidden = false;
  el.onclick = e => { if (e.target === el) closeModal(); };
  modal.onClose = onClose;
  el.querySelector('input,button')?.focus({ preventScroll: true });
}

function closeModal() {
  const el = $('#modal');
  el.hidden = true;
  el.innerHTML = '';
  modal.onClose?.();
  modal.onClose = null;
}

// Eigen bevestigingsvenster (geen browser-confirm).
function confirmBox(title, text, okLabel, onOk, danger = true) {
  modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Annuleren</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" data-act="modal-ok">${esc(okLabel)}</button></div>`);
  confirmBox.ok = onOk;
}

// ---------- Navigatie ----------
function go(view) {
  ui.view = view;
  ui.typing = false;
  render();
  window.scrollTo(0, 0);
}

const PLAY_VIEWS = new Set(['play-score', 'play-clock', 'play-match']);

function render() {
  if (!data.players.length) ui.view = 'welcome';
  const view = VIEWS[ui.view] || VIEWS.home;
  const play = PLAY_VIEWS.has(ui.view);
  document.body.classList.toggle('playing', play);
  $('#app').innerHTML = view();
  $('#tabbar').hidden = play || ui.view === 'welcome';
  document.querySelectorAll('#tabbar [data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === tabOf(ui.view)));
  bindChart($('#app'));
  const auto = $('#app [autofocus]');
  if (auto && !matchMedia('(pointer: coarse)').matches) auto.focus();
}

function tabOf(view) {
  if (view.startsWith('train') || view === 'result-training') return 'train';
  if (view.startsWith('match') || view === 'result-match') return 'match';
  return view;
}

// ---------- Schermen ----------
const VIEWS = {};

VIEWS.welcome = () => `
  <section class="welcome">
    <div class="welcome-logo">${logoSVG({ height: 76 })}</div>
    <p class="lead">Jouw eigen darttrainer. Gooi, tik je pijlen in en zie of je beter wordt.</p>
    <form class="card" data-form="welcome">
      <label for="wname">Hoe heet je?</label>
      <input id="wname" name="name" maxlength="24" autocomplete="nickname" placeholder="Je naam" required autofocus>
      <button class="btn primary big" type="submit">Let's play darts 🎯</button>
    </form>
    <p class="fineprint">Alles wordt op dit toestel bewaard. Geen account, geen reclame.<br>Ontwikkeld door <b>Denckh.</b></p>
  </section>`;

function header(title, back) {
  const p = player();
  return `<header class="top">
    ${back ? `<button class="icon-btn" data-go="${back}" aria-label="Terug">←</button>` : `<div class="top-logo">${logoSVG({ height: 30 })}</div>`}
    ${title ? `<h1>${esc(title)}</h1>` : '<span></span>'}
    <button class="player-chip" data-act="switch-player" aria-label="Speler wisselen"><span class="dot" style="background:${esc(p?.color)}"></span>${esc(p?.name)}</button>
  </header>`;
}

VIEWS.home = () => {
  const o = overview();
  const p = player();
  const recent = myTrainings('score').slice(-12);
  const at = data.active.training, am = data.active.match;
  const earned = earnedBadges(data, data.activePlayerId);
  const next = BADGES.find(b => !earned.has(b.id));
  const greet = (() => { const h = new Date().getHours(); return h < 6 ? 'Nachtsessie' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'; })();
  return `${header('')}
  <main class="page">
    <section class="hero">
      <div class="hero-text">
        <small>${greet},</small>
        <h2>${esc(p.name)}</h2>
        ${o.streak >= 2 ? `<span class="streak">🔥 ${o.streak} dagen op rij</span>` : o.count ? '' : '<span class="streak">Klaar voor je eerste training?</span>'}
      </div>
      <div class="hero-avg">
        <span class="label">Gemiddelde</span>
        <strong data-testid="home-avg">${o.darts ? fmt(o.avg, 1) : '–'}</strong>
        <span class="label">per 3 pijlen</span>
      </div>
    </section>
    ${at ? resumeCard('training', at) : ''}
    ${am ? resumeCard('match', am) : ''}
    <section class="actions">
      <button class="action train" data-go="train">
        <span class="a-icon">🎯</span><span><b>Trainen</b><small>Scoretraining of rond de klok</small></span>
      </button>
      <button class="action match" data-go="match">
        <span class="a-icon">⚔️</span><span><b>Wedstrijd</b><small>301 / 501, alleen of samen</small></span>
      </button>
      <button class="action stats" data-go="stats">
        <span class="a-icon">📈</span><span><b>Mijn statistieken</b><small>Word ik beter?</small></span>
      </button>
    </section>
    <section class="tiles">
      ${tile('Trainingen', int(o.count))}
      ${tile('Beste training', o.best ? fmt(o.best.avg, 1) : '–')}
      ${tile('Hoogste beurt', o.high ? o.high : '–')}
      ${tile('180’s', int(o.t180))}
    </section>
    ${recent.length >= 2 ? `<section class="card"><div class="card-head"><h3>Laatste trainingen</h3><button class="link" data-go="stats">Alles bekijken</button></div>
      ${lineChart(recent.map(t => { const tot = L.trainingTotals(t); return { label: dateLabel(t.startedAt), value: tot.avg, sub: trainingTitle(t) }; }), { height: 160 })}</section>` : ''}
    ${next ? `<section class="card next-badge"><span class="badge-icon locked">${next.icon}</span><div><small>Volgende badge</small><b>${esc(next.name)}</b><p>${esc(next.desc)}</p></div><span class="badge-count">${earned.size}/${BADGES.length}</span></section>` : ''}
  </main>`;
};

function tile(label, value, extra = '') {
  return `<div class="tile ${extra}"><span>${esc(label)}</span><strong>${value}</strong></div>`;
}

function resumeCard(type, a) {
  if (type === 'training') {
    const tot = L.trainingTotals(a);
    const sub = a.kind === 'clock' ? `Bij doel ${L.clockState(a).target === 25 ? 'Bull' : L.clockState(a).target}` : `${tot.darts}${a.limitTurns ? ' / ' + a.limitTurns * 3 : ''} pijlen · gem. ${fmt(tot.avg)}`;
    return `<section class="resume"><div><small>Bezig</small><b>${esc(trainingTitle(a))}</b><span>${sub}</span></div>
      <button class="btn primary" data-act="resume-training">Verder</button></section>`;
  }
  const st = L.matchState(a);
  return `<section class="resume"><div><small>Wedstrijd bezig</small><b>${a.players.map(p => esc(p.name)).join(' – ')}</b><span>${a.settings.start} · legs ${st.won.join('–')}</span></div>
    <button class="btn primary" data-act="resume-match">Verder</button></section>`;
}

// ----- Training kiezen -----
VIEWS.train = () => {
  const s = ui.setup;
  const opt = (turns, label, sub) => `<button class="choice ${s.kind === 'score' && s.turns === turns ? 'on' : ''}" data-act="setup-turns" data-arg="${turns}"><b>${label}</b><small>${sub}</small></button>`;
  return `${header('Trainen', 'home')}
  <main class="page">
    ${data.active.training ? `<div class="note">Je hebt nog een training open. Als je een nieuwe start, wordt die eerst opgeslagen.</div>` : ''}
    <section class="card">
      <h3>Scoretraining</h3>
      <p class="muted">Gooi telkens 3 pijlen en tik ze in. Zo veel mogelijk punten scoren.</p>
      <div class="choices">
        ${opt(10, '30', 'pijlen · 10 beurten')}
        ${opt(20, '60', 'pijlen · 20 beurten')}
        ${opt(33, '99', 'pijlen · 33 beurten')}
        ${opt(0, '∞', 'vrij trainen')}
        ${opt(-1, 'Eigen', `${s.custom} beurten`)}
      </div>
      ${s.turns === -1 ? `<label class="inline">Aantal beurten <input type="number" min="1" max="200" inputmode="numeric" value="${s.custom}" data-input="custom-turns"></label>` : ''}
      <button class="btn primary big" data-act="start-score" data-testid="start-score">Start scoretraining</button>
    </section>
    <section class="card">
      <h3>Rond de klok 🕐</h3>
      <p class="muted">Raak 1 t/m 20 en daarna de bull, in volgorde. Hoe minder pijlen, hoe beter. Enkel, dubbel of triple: alles telt.</p>
      <button class="btn secondary big" data-act="start-clock">Start rond de klok</button>
    </section>
  </main>`;
};

// ----- Toetsenbord -----
function keypad({ highlight = null } = {}) {
  const m = ui.mod;
  const nums = Array.from({ length: 20 }, (_, i) => i + 1)
    .map(n => `<button class="key ${highlight === n ? 'target' : ''}" data-act="key" data-arg="${n}">${m === 2 ? 'D' : m === 3 ? 'T' : ''}${n}</button>`).join('');
  return `<div class="keypad mod-${m}" role="group" aria-label="Score-invoer">
    <div class="mods">
      <button class="mod ${m === 2 ? 'on' : ''}" data-act="mod" data-arg="2" aria-pressed="${m === 2}">DOUBLE</button>
      <button class="mod ${m === 3 ? 'on' : ''}" data-act="mod" data-arg="3" aria-pressed="${m === 3}">TRIPLE</button>
    </div>
    <div class="nums">${nums}</div>
    <div class="specials">
      <button class="key bull ${highlight === 25 ? 'target' : ''}" data-act="key" data-arg="25">25</button>
      <button class="key bull ${highlight === 25 ? 'target' : ''}" data-act="key" data-arg="50">BULL</button>
      <button class="key miss" data-act="key" data-arg="0">MIS</button>
      <button class="key undo" data-act="undo" aria-label="Laatste pijl wissen">⌫</button>
    </div>
  </div>`;
}

function dartSlots(pending, extra = '') {
  return `<div class="slots ${extra}">${[0, 1, 2].map(i => {
    const c = pending[i];
    return `<div class="slot ${c ? 'filled' : ''} ${i === pending.length ? 'current' : ''}" data-testid="slot-${i}">
      <small>Pijl ${i + 1}</small><b>${c ? esc(L.label(c)) : ''}</b>${c ? `<span>${L.points(c)}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

function typeBox() {
  return ui.typing ? `<form class="typebox" data-form="type"><input name="line" placeholder="bv. T20 5 D10" autocomplete="off" autocapitalize="characters" enterkeyhint="done" autofocus aria-label="Typ je pijlen"><button class="btn primary">OK</button></form>` : '';
}

// ----- Scoretraining spelen -----
VIEWS['play-score'] = () => {
  const t = data.active.training;
  if (!t) return VIEWS.home();
  const tot = L.trainingTotals(t);
  const limit = L.trainingLimitDarts(t);
  const pend = t.pending;
  const turnNo = t.turns.length + 1;
  const last = t.turns[t.turns.length - 1];
  const pct = limit ? Math.min(100, (tot.darts / limit) * 100) : 0;
  return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">⏸</button>
      <div class="play-title"><b>${esc(trainingTitle(t))}</b><small>Beurt ${turnNo}${t.limitTurns ? ' van ' + t.limitTurns : ''}</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">⌨</button>
    </header>
    ${limit ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
    <section class="scoreboard">
      <div class="sb-main"><span>Gemiddelde</span><strong data-testid="live-avg">${fmt(tot.avg, 2)}</strong></div>
      <div class="sb-side">
        <div><span>Totaal</span><b data-testid="live-total">${int(tot.points)}</b></div>
        <div><span>Pijlen</span><b>${tot.darts}${limit ? '/' + limit : ''}</b></div>
        <div><span>Hoogste</span><b>${tot.high ?? '–'}</b></div>
        <div><span>Laagste</span><b>${tot.low ?? '–'}</b></div>
      </div>
    </section>
    <div class="turn-row">
      ${dartSlots(pend)}
      <div class="turn-total"><small>Deze beurt</small><strong data-testid="turn-total">${L.turnScore(pend)}</strong>
        ${last && !pend.length ? `<span class="last">vorige: ${L.turnScore(last.darts)}</span>` : ''}</div>
    </div>
    ${typeBox()}
    ${keypad()}
    <div class="play-actions">
      <button class="btn ghost small" data-act="finish-training">${t.turns.length ? 'Klaar & bewaren' : 'Stoppen'}</button>
    </div>
  </div>`;
};

// ----- Rond de klok spelen -----
VIEWS['play-clock'] = () => {
  const t = data.active.training;
  if (!t) return VIEWS.home();
  const flat = { ...t, turns: [...t.turns, ...(t.pending.length ? [{ darts: t.pending }] : [])] };
  const st = L.clockState(flat);
  const pend = t.pending;
  const targetLabel = st.target === 25 ? 'BULL' : st.target;
  return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">⏸</button>
      <div class="play-title"><b>Rond de klok</b><small>${st.darts} pijlen gegooid</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">⌨</button>
    </header>
    <div class="progress"><i style="width:${(st.targetIndex / L.CLOCK_TARGETS.length) * 100}%"></i></div>
    <section class="scoreboard clock">
      <div class="sb-main"><span>Gooi op</span><strong class="target-num" data-testid="clock-target">${targetLabel}</strong></div>
      <div class="sb-side">
        <div><span>Raak</span><b>${st.hits}/21</b></div>
        <div><span>Pijlen</span><b>${st.darts}</b></div>
        <div><span>Trefkans</span><b>${st.darts ? Math.round(st.hitRate * 100) + '%' : '–'}</b></div>
      </div>
    </section>
    <div class="clock-track">${L.CLOCK_TARGETS.map((n, i) => `<span class="${i < st.targetIndex ? 'done' : i === st.targetIndex ? 'now' : ''}">${n === 25 ? 'B' : n}</span>`).join('')}</div>
    <div class="turn-row">${dartSlots(pend)}<div class="turn-total"><small>Tip</small><strong class="tip">Alles op ${targetLabel} telt</strong></div></div>
    ${typeBox()}
    ${keypad({ highlight: st.target })}
    <div class="play-actions"><button class="btn ghost small" data-act="finish-training">Stoppen & bewaren</button></div>
  </div>`;
};

// ----- Training-uitslag -----
VIEWS['result-training'] = () => {
  const r = ui.result;
  if (!r) return VIEWS.home();
  const t = data.trainings.find(x => x.id === r.id);
  if (!t) return VIEWS.home();
  if (t.kind === 'clock') {
    const st = L.clockState(t);
    return `${header('Uitslag', 'home')}<main class="page">
      <section class="result-hero"><small>Rond de klok</small><strong>${st.done ? st.darts : st.hits + '/21'}</strong><span>${st.done ? 'pijlen nodig' : 'doelen geraakt'}</span></section>
      ${r.newBadges.length ? badgeBanner(r.newBadges) : ''}
      <section class="tiles">${tile('Trefkans', Math.round(st.hitRate * 100) + '%')}${tile('Pijlen', st.darts)}${tile('Beste ooit', r.bestClock ? r.bestClock + ' pijlen' : '–')}</section>
      <div class="row-actions"><button class="btn primary big" data-act="again">Nog een keer</button><button class="btn ghost big" data-go="home">Home</button></div>
    </main>`;
  }
  const tot = L.trainingTotals(t);
  return `${header('Uitslag', 'home')}<main class="page">
    <section class="result-hero"><small>${esc(trainingTitle(t))}</small><strong data-testid="result-avg">${fmt(tot.avg, 2)}</strong><span>gemiddelde per 3 pijlen</span>
      ${r.prevAvg !== null ? `<em class="${tot.avg >= r.prevAvg ? 'up' : 'down'}">${tot.avg >= r.prevAvg ? '▲' : '▼'} ${fmt(Math.abs(tot.avg - r.prevAvg), 2)} t.o.v. je gemiddelde hiervoor</em>` : ''}</section>
    ${r.records.length ? `<section class="records-banner">🏅 <b>Nieuw record!</b> ${r.records.map(esc).join(' · ')}</section>` : ''}
    ${r.newBadges.length ? badgeBanner(r.newBadges) : ''}
    <section class="tiles">
      ${tile('Totaal', int(tot.points))}${tile('Pijlen', tot.darts)}${tile('Hoogste', tot.high ?? '–')}${tile('Laagste', tot.low ?? '–')}
      ${tile('100+', tot.tons)}${tile('140+', tot.t140)}${tile('180', tot.t180)}${tile('Beurten', tot.turns)}
    </section>
    <section class="card"><h3>Per beurt</h3>${turnBars(t.turns)}</section>
    <div class="row-actions"><button class="btn primary big" data-act="again">Nog een keer</button><button class="btn ghost big" data-go="stats">Statistieken</button></div>
  </main>`;
};

function badgeBanner(ids) {
  return `<section class="badge-banner">${ids.map(id => { const b = BADGES.find(x => x.id === id); return `<div><span class="badge-icon">${b.icon}</span><div><small>Badge verdiend!</small><b>${esc(b.name)}</b></div></div>`; }).join('')}</section>`;
}

function turnBars(turns) {
  const max = Math.max(60, ...turns.map(t => L.turnScore(t.darts)));
  return `<div class="bars">${turns.map((t, i) => {
    const s = L.turnScore(t.darts);
    return `<div class="bar ${s >= 100 ? 'ton' : ''}" title="Beurt ${i + 1}: ${t.darts.map(L.label).join(' ')}"><i style="height:${(s / max) * 100}%"></i><span>${s}</span></div>`;
  }).join('')}</div>`;
}

// ----- Wedstrijd instellen -----
VIEWS.match = () => {
  const m = ui.match;
  if (!m.players.length) m.players = [{ id: data.activePlayerId, name: player().name }];
  const chip = (key, val, label) => `<button class="chip ${m[key] === val ? 'on' : ''}" data-act="match-set" data-arg="${key}:${val}">${label}</button>`;
  const others = data.players.filter(p => !m.players.some(x => x.id === p.id));
  return `${header('Wedstrijd', 'home')}
  <main class="page">
    ${data.active.match ? `<div class="note">Er loopt nog een wedstrijd. <button class="link" data-act="resume-match">Hervatten</button></div>` : ''}
    <section class="card">
      <h3>Spel</h3>
      <div class="chips">${chip('start', 301, '301')}${chip('start', 501, '501')}</div>
      <h4>Aantal legs</h4>
      <div class="chips">${chip('bestOf', 1, '1 leg')}${chip('bestOf', 3, 'Best of 3')}${chip('bestOf', 5, 'Best of 5')}${chip('bestOf', 7, 'Best of 7')}${chip('bestOf', 9, 'Best of 9')}</div>
      <h4>Uitgooien</h4>
      <div class="chips">${chip('doubleOut', true, 'Double out')}${chip('doubleOut', false, 'Straight out')}</div>
    </section>
    <section class="card">
      <h3>Spelers <small class="muted">(wie begint staat bovenaan)</small></h3>
      <ol class="match-players">${m.players.map((p, i) => `<li><span>${esc(p.name)}${p.id ? '' : ' <small class="muted">gast</small>'}</span>
        ${i > 0 ? `<button class="icon-btn small" data-act="mp-up" data-arg="${i}" aria-label="Omhoog">↑</button>` : ''}
        ${m.players.length > 1 ? `<button class="icon-btn small" data-act="mp-remove" data-arg="${i}" aria-label="Verwijderen">✕</button>` : ''}</li>`).join('')}</ol>
      ${m.players.length < 4 ? `<div class="add-player">
        ${others.map(p => `<button class="chip" data-act="mp-add" data-arg="${esc(p.id)}">+ ${esc(p.name)}</button>`).join('')}
        <form data-form="guest" class="guest"><input name="name" maxlength="24" placeholder="Naam tegenstander" aria-label="Naam tegenstander"><button class="btn secondary">+ Toevoegen</button></form>
      </div>` : ''}
      <p class="muted small">Tip: een tegenstander met een eigen profiel (Meer → Spelers) krijgt ook eigen statistieken.</p>
    </section>
    <button class="btn primary big" data-act="start-match" data-testid="start-match">Start ${m.start} ${m.players.length > 1 ? '' : '(solo)'}</button>
  </main>`;
};

// ----- Wedstrijd spelen -----
function currentLeg(m) { return m.legs[m.legs.length - 1]; }

VIEWS['play-match'] = () => {
  const m = data.active.match;
  if (!m) return VIEWS.home();
  const leg = currentLeg(m);
  const ls = L.legState(leg, m.settings.start, m.players.length, m.settings.doubleOut);
  const ms = L.matchState(m);
  const cur = ls.toThrow;
  const pend = m.pending;
  const live = L.x01Turn(ls.remaining[cur], pend, m.settings.doubleOut);
  const rest = live.remaining;
  const dartsLeft = 3 - pend.length;
  const route = rest <= 170 ? L.checkout(rest, dartsLeft, m.settings.doubleOut) : null;
  return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">⏸</button>
      <div class="play-title"><b>${m.settings.start} · ${m.settings.bestOf === 1 ? '1 leg' : 'Best of ' + m.settings.bestOf}</b><small>Leg ${m.legs.length} · ${m.settings.doubleOut ? 'double out' : 'straight out'}</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">⌨</button>
    </header>
    <section class="x01 n${m.players.length}">
      ${m.players.map((p, i) => {
        const t = ms.totals[i];
        const legAvg = L.avg3(ls.stats[i].points, ls.stats[i].darts);
        const remaining = i === cur ? rest : ls.remaining[i];
        return `<div class="x01-player ${i === cur ? 'up' : ''}" data-testid="player-${i}">
          <div class="x01-name">${i === cur ? '<i class="throw-dot"></i>' : ''}${esc(p.name)}${m.settings.bestOf > 1 ? `<span class="legs">${ms.won[i]}</span>` : ''}</div>
          <strong class="x01-rest" data-testid="rest-${i}">${remaining}</strong>
          <small>gem. ${fmt(t.darts ? t.avg : legAvg, 1)} · ${t.darts} pijlen</small>
        </div>`;
      }).join('')}
    </section>
    <div class="checkout ${route ? '' : 'none'}" data-testid="checkout">${route ? `<span>Uitgooien:</span> ${route.map(c => `<b>${esc(L.label(c))}</b>`).join('')}` : rest <= 170 && m.settings.doubleOut && rest > 1 ? `<span>Geen finish met ${dartsLeft} pijl${dartsLeft === 1 ? '' : 'en'}</span>` : `<span>${esc(m.players[cur].name)} is aan de beurt</span>`}</div>
    <div class="turn-row">${dartSlots(pend)}<div class="turn-total"><small>Deze beurt</small><strong data-testid="turn-total">${L.turnScore(pend)}</strong></div></div>
    ${typeBox()}
    ${keypad()}
    <div class="play-actions"><button class="btn ghost small" data-act="stop-match">Wedstrijd stoppen</button></div>
  </div>`;
};

VIEWS['result-match'] = () => {
  const m = data.matches.find(x => x.id === ui.result?.id);
  if (!m) return VIEWS.home();
  const st = L.matchState(m);
  const w = st.winner;
  return `${header('Uitslag', 'home')}<main class="page">
    <section class="result-hero win"><small>${m.players.length > 1 ? 'Winnaar' : 'Uitgegooid!'}</small><strong>${w !== null ? esc(m.players[w].name) : 'Gestopt'}</strong>
      <span>${m.players.length > 1 ? st.won.join(' – ') + ' in legs' : m.settings.start + ' uitgegooid'}</span></section>
    ${ui.result.newBadges?.length ? badgeBanner(ui.result.newBadges) : ''}
    ${matchTable(m, st)}
    <div class="row-actions"><button class="btn primary big" data-act="rematch">Revanche!</button><button class="btn ghost big" data-go="home">Home</button></div>
  </main>`;
};

function matchTable(m, st) {
  const row = (label, f) => `<tr><th>${label}</th>${m.players.map((_, i) => `<td>${f(st.totals[i], i)}</td>`).join('')}</tr>`;
  return `<section class="card"><table class="mtable"><thead><tr><th></th>${m.players.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
    ${m.settings.bestOf > 1 ? row('Legs', (t, i) => st.won[i]) : ''}
    ${row('Gemiddelde', t => fmt(t.avg, 2))}
    ${row('Hoogste beurt', t => t.high)}
    ${row('Beste finish', t => t.bestCheckout || '–')}
    ${row('100+', t => t.t100)}${row('140+', t => t.t140)}${row('180', t => t.t180)}
    ${row('Pijlen', t => t.darts)}
  </tbody></table></section>`;
}

// ----- Statistieken -----
VIEWS.stats = () => {
  const all = myTrainings('score');
  const f = ui.statsFilter;
  let ts = f === 'all' ? all : all.filter(t => filterKey(t) === f);
  if (ui.statsLast10) ts = ts.slice(-10);
  const turns = ts.flatMap(t => t.turns);
  let pts = 0, darts = 0, high = 0, tons = 0, t140 = 0, t180 = 0, best = null, worst = null;
  for (const t of ts) {
    const tot = L.trainingTotals(t);
    pts += tot.points; darts += tot.darts; high = Math.max(high, tot.high ?? 0);
    tons += tot.tons; t140 += tot.t140; t180 += tot.t180;
    if (tot.darts >= 9) {
      if (!best || tot.avg > best) best = tot.avg;
      if (worst === null || tot.avg < worst) worst = tot.avg;
    }
  }
  const sessAvg = ts.length ? ts.reduce((a, t) => a + L.trainingTotals(t).avg, 0) / ts.length : 0;
  const groups = L.groupAverages(ts, ui.statsPeriod);
  const chartPts = groups.map(g => ({
    label: ui.statsPeriod === 'training' || ui.statsPeriod === 'dag' ? dateLabel(g.date) : ui.statsPeriod === 'week' ? 'wk ' + g.key.split('-W')[1] : new Date(g.date).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }),
    value: g.avg,
    sub: `${g.count} training${g.count === 1 ? '' : 'en'} · ${g.darts} pijlen`,
  }));
  const dist = L.hitDistribution([...turns, ...myTrainings('clock').flatMap(t => t.turns)]);
  const counts = Object.entries(dist.bySeg).map(([seg, c]) => [seg, c.S + c.D + c.T]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const chip = (key, val, label) => `<button class="chip ${ui[key] === val ? 'on' : ''}" data-act="stats-set" data-arg="${key}:${val}">${label}</button>`;
  const cmp = compareLast10(all.filter(t => f === 'all' || filterKey(t) === f));
  const earned = earnedBadges(data, data.activePlayerId);
  const matches = myMatches();
  const mStats = matchSummary(matches);
  return `${header('Statistieken', 'home')}
  <main class="page">
    <div class="chips scroll">${chip('statsFilter', 'all', 'Alle')}${chip('statsFilter', '30', '30 pijlen')}${chip('statsFilter', '60', '60 pijlen')}${chip('statsFilter', '99', '99 pijlen')}${chip('statsFilter', 'vrij', 'Vrij')}
      <button class="chip ${ui.statsLast10 ? 'on' : ''}" data-act="stats-last10">Laatste 10</button></div>
    ${!ts.length ? `<section class="card empty"><p>Nog geen scoretrainingen${f !== 'all' ? ' van dit type' : ''}. Start een training en je statistieken verschijnen hier vanzelf.</p><button class="btn primary" data-go="train">Naar trainen</button></section>` : `
    <section class="tiles">
      ${tile('Gemiddelde', fmt(L.avg3(pts, darts), 2), 'hl')}
      ${tile('Trainingen', ts.length)}
      ${tile('Beste training', best !== null ? fmt(best, 2) : '–')}
      ${tile('Slechtste', worst !== null ? fmt(worst, 2) : '–')}
      ${tile('Hoogste beurt', high || '–')}
      ${tile('Pijlen', int(darts))}
      ${tile('100+', tons)}${tile('140+', t140)}${tile('180', t180)}
    </section>
    <p class="muted small explain">Het gemiddelde is altijd <b>punten per 3 pijlen</b> over álle gegooide pijlen (${int(pts)} punten / ${int(darts)} pijlen × 3). Het gewone gemiddelde van je trainingsgemiddelden is ${fmt(sessAvg, 2)}.</p>
    ${cmp ? `<section class="card compare"><h3>Word ik beter?</h3><p>Laatste ${cmp.n} trainingen: <b>${fmt(cmp.recent, 2)}</b>${cmp.before !== null ? ` · de ${cmp.nb} daarvoor: <b>${fmt(cmp.before, 2)}</b>` : ''}</p>
      ${cmp.before !== null ? `<p class="delta ${cmp.recent >= cmp.before ? 'up' : 'down'}">${cmp.recent >= cmp.before ? '▲ Je gaat vooruit' : '▼ Iets lager dan eerst'}: ${cmp.recent >= cmp.before ? '+' : '−'}${fmt(Math.abs(cmp.recent - cmp.before), 2)}</p>` : ''}</section>` : ''}
    <section class="card">
      <div class="card-head"><h3>Ontwikkeling</h3></div>
      <div class="chips small">${chip('statsPeriod', 'training', 'Per training')}${chip('statsPeriod', 'dag', 'Dag')}${chip('statsPeriod', 'week', 'Week')}${chip('statsPeriod', 'maand', 'Maand')}</div>
      ${lineChart(chartPts)}
      <p class="muted small">Tik op een punt voor details. De stippellijn is je trend.</p>
    </section>`}
    <section class="card">
      <div class="card-head"><h3>Trefferkaart</h3></div>
      <div class="chips small">${chip('heatMode', 'all', 'Alles')}${chip('heatMode', 'S', 'Enkel')}${chip('heatMode', 'D', 'Dubbel')}${chip('heatMode', 'T', 'Triple')}</div>
      ${dist.total ? `<div class="board-wrap">${boardSVG(dist, ui.heatMode)}</div>${heatLegend()}
      <p class="muted small">Toont welk vak je raakte (bijv. T20), niet de precieze plek van de pijl. Enkele treffers kleuren beide enkele ringen.</p>
      <div class="split">${splitBar(dist)}</div>
      <h4>Meest geraakt</h4><div class="top-nums">${counts.map(([seg, n]) => `<span><b>${seg === '25' ? 'Bull' : seg}</b>${n}×</span>`).join('')}</div>` : '<p class="muted">Nog geen worpen.</p>'}
    </section>
    <section class="card">
      <h3>Persoonlijke records</h3>
      ${recordList()}
    </section>
    <section class="card">
      <div class="card-head"><h3>Badges</h3><span class="badge-count">${earned.size}/${BADGES.length}</span></div>
      <div class="badges">${BADGES.map(b => `<div class="badge ${earned.has(b.id) ? '' : 'locked'}" title="${esc(b.desc)}"><span class="badge-icon">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}</div>
    </section>
    <section class="card">
      <h3>Wedstrijden</h3>
      ${matches.length ? `<section class="tiles">${tile('Gespeeld', mStats.played)}${tile('Gewonnen', mStats.won)}${tile('Gemiddelde', fmt(mStats.avg, 2))}${tile('Beste finish', mStats.bestCo || '–')}</section>` : '<p class="muted">Nog geen wedstrijden gespeeld.</p>'}
    </section>
  </main>`;
};

function splitBar(dist) {
  const m = dist.mult, total = dist.total || 1;
  const parts = [['S', 'Enkel', m.S], ['D', 'Dubbel', m.D], ['T', 'Triple', m.T], ['B', 'Bull', m.B], ['M', 'Mis', m.M]];
  return `<div class="splitbar">${parts.map(([k, , n]) => n ? `<i class="s-${k}" style="flex:${n}"></i>` : '').join('')}</div>
    <div class="splitlegend">${parts.map(([k, lab, n]) => `<span><i class="s-${k}"></i>${lab} ${Math.round((n / total) * 100)}%</span>`).join('')}</div>`;
}

function compareLast10(list) {
  if (list.length < 2) return null;
  const n = Math.min(10, list.length);
  const recent = list.slice(-n), before = list.slice(-2 * n, -n);
  const agg = arr => { let p = 0, d = 0; arr.forEach(t => { const x = L.trainingTotals(t); p += x.points; d += x.darts; }); return L.avg3(p, d); };
  return { n, recent: agg(recent), before: before.length ? agg(before) : null, nb: before.length };
}

function matchSummary(matches) {
  let played = 0, won = 0, p = 0, d = 0, bestCo = 0;
  for (const m of matches) {
    const i = m.players.findIndex(x => x.id === data.activePlayerId);
    const st = L.matchState(m);
    played++;
    if (st.winner === i) won++;
    p += st.totals[i].points; d += st.totals[i].darts;
    bestCo = Math.max(bestCo, st.totals[i].bestCheckout);
  }
  return { played, won, avg: L.avg3(p, d), bestCo };
}

function records(playerId = data.activePlayerId) {
  const out = {};
  for (const t of data.trainings.filter(x => x.playerId === playerId)) {
    if (t.kind === 'clock') {
      const st = L.clockState(t);
      if (st.done && (!out.clock || st.darts < out.clock)) out.clock = st.darts;
      continue;
    }
    const tot = L.trainingTotals(t);
    if (tot.high !== null && (!out.high || tot.high > out.high)) out.high = tot.high;
    if (tot.tons && (!out.tons || tot.tons > out.tons)) out.tons = tot.tons;
    if (t.limitTurns) {
      const k = 'avg' + t.limitTurns * 3;
      if (tot.darts >= t.limitTurns * 3 && (!out[k] || tot.avg > out[k])) out[k] = tot.avg;
    }
  }
  for (const m of data.matches) {
    const i = m.players.findIndex(p => p.id === playerId);
    if (i < 0) continue;
    const st = L.matchState(m);
    if (st.totals[i].bestCheckout && (!out.checkout || st.totals[i].bestCheckout > out.checkout)) out.checkout = st.totals[i].bestCheckout;
    if (st.totals[i].darts >= 9 && (!out.matchAvg || st.totals[i].avg > out.matchAvg)) out.matchAvg = st.totals[i].avg;
  }
  return out;
}

const RECORD_LABELS = {
  avg30: ['Beste 30 pijlen', v => fmt(v, 2)],
  avg60: ['Beste 60 pijlen', v => fmt(v, 2)],
  avg99: ['Beste 99 pijlen', v => fmt(v, 2)],
  high: ['Hoogste beurt', v => v],
  tons: ['Meeste 100+ in één training', v => v],
  clock: ['Snelste rond de klok', v => v + ' pijlen'],
  checkout: ['Hoogste finish', v => v],
  matchAvg: ['Beste wedstrijdgemiddelde', v => fmt(v, 2)],
};

function recordList() {
  const r = records();
  const rows = Object.entries(RECORD_LABELS).filter(([k]) => r[k] !== undefined);
  if (!rows.length) return '<p class="muted">Nog geen records. Die komen vanzelf!</p>';
  return `<ul class="records">${rows.map(([k, [lab, f]]) => `<li><span>${lab}</span><b>${f(r[k])}</b></li>`).join('')}</ul>`;
}

function diffRecords(before, after) {
  const out = [];
  for (const [k, [lab, f]] of Object.entries(RECORD_LABELS)) {
    if (after[k] === undefined || before[k] === undefined) continue;
    const better = k === 'clock' ? after[k] < before[k] : after[k] > before[k];
    if (better) out.push(`${lab}: ${f(after[k])}`);
  }
  return out;
}

// ----- Geschiedenis -----
VIEWS.history = () => {
  const items = [
    ...myTrainings().map(t => ({ type: 't', at: t.startedAt, t })),
    ...myMatches().map(m => ({ type: 'm', at: m.startedAt, m })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  let lastDay = '';
  return `${header('Geschiedenis', 'home')}
  <main class="page">
    ${!items.length ? '<section class="card empty"><p>Nog niets gespeeld. Je trainingen en wedstrijden verschijnen hier.</p></section>' : ''}
    <ul class="history">${items.map(it => {
      const day = new Date(it.at).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const head = day !== lastDay ? `<li class="day">${day}</li>` : '';
      lastDay = day;
      if (it.type === 't') {
        const t = it.t;
        const main = t.kind === 'clock' ? (L.clockState(t).done ? L.clockState(t).darts + ' pijlen' : L.clockState(t).hits + '/21') : fmt(L.trainingTotals(t).avg, 2);
        const sub = t.kind === 'clock' ? 'rond de klok' : `${L.trainingTotals(t).points} pnt · ${L.trainingTotals(t).darts} pijlen`;
        return `${head}<li><button class="h-item" data-act="open-training" data-arg="${esc(t.id)}"><span class="h-icon">${t.kind === 'clock' ? '🕐' : '🎯'}</span><span class="h-main"><b>${esc(trainingTitle(t))}</b><small>${new Date(t.startedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · ${sub}</small></span><strong>${main}</strong></button></li>`;
      }
      const m = it.m, st = L.matchState(m);
      const i = m.players.findIndex(p => p.id === data.activePlayerId);
      const res = m.players.length > 1 ? (st.winner === i ? 'Gewonnen' : st.winner === null ? 'Gestopt' : 'Verloren') : (st.winner !== null ? 'Uit!' : 'Gestopt');
      return `${head}<li><button class="h-item" data-act="open-match" data-arg="${esc(m.id)}"><span class="h-icon">⚔️</span><span class="h-main"><b>${m.settings.start} · ${m.players.map(p => esc(p.name)).join(' – ')}</b><small>${res} · ${st.won.join('–')}</small></span><strong>${fmt(st.totals[i].avg, 1)}</strong></button></li>`;
    }).join('')}</ul>
  </main>`;
};

function trainingDetail(t) {
  const isClock = t.kind === 'clock';
  const tot = L.trainingTotals(t);
  modal(`<h3>${esc(trainingTitle(t))}</h3><p class="muted">${dateTime(t.startedAt)}</p>
    ${isClock ? `<p>${L.clockState(t).done ? 'Klaar in <b>' + L.clockState(t).darts + '</b> pijlen' : 'Gestopt bij ' + L.clockState(t).hits + '/21'}</p>`
      : `<div class="tiles mini">${tile('Gemiddelde', fmt(tot.avg, 2))}${tile('Totaal', tot.points)}${tile('Pijlen', tot.darts)}${tile('Hoogste', tot.high ?? '–')}</div>`}
    <ol class="turnlist">${t.turns.map((turn, i) => `<li><span>${i + 1}</span><span class="darts">${turn.darts.map(c => `<i>${esc(L.label(c))}</i>`).join('')}</span><b>${isClock ? '' : L.turnScore(turn.darts)}</b></li>`).join('')}</ol>
    <div class="modal-actions"><button class="btn danger ghost" data-act="delete-training" data-arg="${esc(t.id)}">Verwijderen</button><button class="btn primary" data-act="modal-close">Sluiten</button></div>`);
}

function matchDetail(m) {
  const st = L.matchState(m);
  modal(`<h3>${m.settings.start} · ${m.players.map(p => esc(p.name)).join(' – ')}</h3><p class="muted">${dateTime(m.startedAt)} · ${m.settings.doubleOut ? 'double out' : 'straight out'}</p>
    ${matchTable(m, st)}
    ${m.legs.map((leg, li) => {
      const rem = Array(m.players.length).fill(m.settings.start);
      return `<h4>Leg ${li + 1}</h4><ol class="turnlist">${leg.turns.map(turn => {
        const r = L.x01Turn(rem[turn.p], turn.darts, m.settings.doubleOut); rem[turn.p] = r.remaining;
        return `<li><span>${esc(m.players[turn.p].name)}</span><span class="darts">${turn.darts.map(c => `<i>${esc(L.label(c))}</i>`).join('')}</span><b>${r.bust ? 'BUST' : r.finished ? 'UIT ' + r.scored : r.scored} <small>(${r.remaining})</small></b></li>`;
      }).join('')}</ol>`;
    }).join('')}
    <div class="modal-actions"><button class="btn danger ghost" data-act="delete-match" data-arg="${esc(m.id)}">Verwijderen</button><button class="btn primary" data-act="modal-close">Sluiten</button></div>`);
}

// ----- Meer / instellingen -----
VIEWS.more = () => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `${header('Meer', 'home')}
  <main class="page">
    <section class="card">
      <h3>Spelers</h3>
      <ul class="players">${data.players.map(p => `<li><span class="dot" style="background:${esc(p.color)}"></span><b>${esc(p.name)}</b>
        ${p.id === data.activePlayerId ? '<small class="muted">actief</small>' : `<button class="link" data-act="use-player" data-arg="${esc(p.id)}">Kiezen</button>`}
        <button class="icon-btn small" data-act="rename-player" data-arg="${esc(p.id)}" aria-label="Naam wijzigen">✎</button>
        ${data.players.length > 1 ? `<button class="icon-btn small" data-act="delete-player" data-arg="${esc(p.id)}" aria-label="Speler verwijderen">✕</button>` : ''}</li>`).join('')}</ul>
      <form data-form="add-player" class="guest"><input name="name" maxlength="24" placeholder="Nieuwe speler" aria-label="Naam nieuwe speler"><button class="btn secondary">+ Speler</button></form>
    </section>
    <section class="card">
      <h3>Geschiedenis</h3>
      <p class="muted">Alle trainingen en wedstrijden terugkijken, corrigeren of verwijderen.</p>
      <button class="btn secondary" data-go="history">Open geschiedenis</button>
    </section>
    <section class="card">
      <h3>Back-up</h3>
      <p class="muted">Je gegevens staan alleen op dit toestel (in de browser). Ze gaan niet automatisch naar een andere telefoon. Maak af en toe een back-up, zeker voordat je de browser opschoont.</p>
      <div class="row-actions"><button class="btn primary" data-act="export">⬇ Back-up downloaden</button>
      <label class="btn secondary file">⬆ Back-up terugzetten<input type="file" accept="application/json,.json" data-input="import" hidden></label></div>
    </section>
    <section class="card">
      <h3>Installeren als app</h3>
      ${standalone ? '<p>✅ OCHE draait als app. Top!</p>' : ios
        ? '<ol class="steps"><li>Open deze pagina in <b>Safari</b>.</li><li>Tik op <b>Deel</b> (vierkantje met pijl omhoog).</li><li>Kies <b>Zet op beginscherm</b> en tik op <b>Voeg toe</b>.</li></ol>'
        : `${ui.installEvent ? '<button class="btn primary" data-act="install">📲 Installeer OCHE</button>' : ''}<ol class="steps"><li>Open deze pagina in <b>Chrome</b>.</li><li>Tik op het menu <b>⋮</b>.</li><li>Kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.</li></ol>`}
      <p class="muted small">Na installatie werkt OCHE ook zonder internet.</p>
    </section>
    <section class="card">
      <h3>Instellingen</h3>
      ${toggle('sound', 'Geluidjes')}${toggle('vibrate', 'Trillen bij tikken')}
      <div class="setting"><span>Thema</span><div class="chips small"><button class="chip ${data.settings.theme === 'dark' ? 'on' : ''}" data-act="theme" data-arg="dark">Donker</button><button class="chip ${data.settings.theme === 'light' ? 'on' : ''}" data-act="theme" data-arg="light">Licht</button></div></div>
    </section>
    <section class="card about">
      ${logoSVG({ height: 34 })}
      <p class="muted small">Versie ${APP_VERSION}. "Oche" is de werplijn waar je achter staat bij darts. Geen account, geen tracking, geen reclame.</p>
      <p class="credit">Ontwikkeld door <b>Denckh.</b></p>
    </section>
  </main>`;
};

function toggle(key, label) {
  return `<label class="setting"><span>${label}</span><input type="checkbox" class="switch" data-input="setting" data-arg="${key}" ${data.settings[key] ? 'checked' : ''}></label>`;
}

// ---------- Acties ----------
function startScore() {
  finishActiveTraining(false);
  const s = ui.setup;
  const turns = s.turns === -1 ? Math.max(1, Math.min(200, Number(s.custom) || 10)) : s.turns;
  data.active.training = { id: S.uid(), playerId: data.activePlayerId, kind: 'score', limitTurns: turns || null, startedAt: now(), turns: [], pending: [] };
  ui.mod = 1;
  save();
  go('play-score');
}

function startClock() {
  finishActiveTraining(false);
  data.active.training = { id: S.uid(), playerId: data.activePlayerId, kind: 'clock', limitTurns: null, startedAt: now(), turns: [], pending: [] };
  ui.mod = 1;
  save();
  go('play-clock');
}

// Training afronden en in de geschiedenis zetten. showResult: naar uitslagscherm.
function finishActiveTraining(showResult = true) {
  const t = data.active.training;
  if (!t) return;
  if (t.pending.length) t.turns.push({ at: now(), darts: t.pending });
  data.active.training = null;
  if (!t.turns.length) { save(); if (showResult) go('home'); return; }
  const recBefore = records(t.playerId);
  const badgesBefore = earnedBadges(data, t.playerId);
  const prev = data.trainings.filter(x => x.playerId === t.playerId && x.kind === 'score' && (x.limitTurns || 0) === (t.limitTurns || 0));
  let pp = 0, pd = 0;
  prev.forEach(x => { const tt = L.trainingTotals(x); pp += tt.points; pd += tt.darts; });
  const { pending, ...clean } = t;
  data.trainings.push({ ...clean, finishedAt: now() });
  save();
  const recAfter = records(t.playerId);
  const badgesAfter = earnedBadges(data, t.playerId);
  const newBadges = [...badgesAfter].filter(b => !badgesBefore.has(b));
  ui.result = { id: t.id, prevAvg: pd ? L.avg3(pp, pd) : null, records: diffRecords(recBefore, recAfter), newBadges, bestClock: recAfter.clock };
  if (showResult) {
    go('result-training');
    if (newBadges.length || ui.result.records.length) { beep('win'); haptic([30, 30, 60]); }
  }
}

function addDart(code) {
  const t = performance.now();
  // Spook-tik (zelfde toets twee keer binnen 35 ms) negeren; sneller kan niemand echt tikken.
  if (code === ui.lastCode && t - ui.lastTap < 35) return;
  ui.lastTap = t;
  ui.lastCode = code;
  haptic(8);
  if (ui.view === 'play-match') return addMatchDart(code);
  const tr = data.active.training;
  if (!tr) return;
  tr.pending.push(code);
  ui.mod = 1;
  if (tr.kind === 'clock') {
    const st = L.clockState({ turns: [...tr.turns, { darts: tr.pending }] });
    if (st.done || tr.pending.length === 3) {
      tr.turns.push({ at: now(), darts: tr.pending });
      tr.pending = [];
    }
    save();
    if (st.done) { celebrate('KLAAR!', `${st.darts} pijlen`, 'win'); beep('win'); finishActiveTraining(true); return; }
    render();
    return;
  }
  if (tr.pending.length === 3) {
    const score = L.turnScore(tr.pending);
    tr.turns.push({ at: now(), darts: tr.pending });
    tr.pending = [];
    save();
    turnCelebration(score);
    if (L.trainingIsComplete(tr)) {
      finishActiveTraining(true);
      return;
    }
  } else save();
  render();
}

function undo() {
  haptic(15);
  if (ui.view === 'play-match') return undoMatch();
  const tr = data.active.training;
  if (!tr) return;
  if (tr.pending.length) tr.pending.pop();
  else if (tr.turns.length) { tr.pending = tr.turns.pop().darts.slice(0, -1); }
  else return toast('Er is nog niets om te wissen.');
  save();
  render();
}

function startMatch() {
  const m = ui.match;
  if (!m.players.length) return toast('Voeg minstens één speler toe.');
  data.active.match = {
    id: S.uid(),
    startedAt: now(),
    settings: { start: m.start, bestOf: m.bestOf, doubleOut: m.doubleOut },
    players: m.players.map(p => ({ id: p.id || null, name: p.name })),
    legs: [{ starter: 0, turns: [] }],
    pending: [],
  };
  ui.mod = 1;
  save();
  go('play-match');
}

function addMatchDart(code) {
  const m = data.active.match;
  if (!m) return;
  const leg = currentLeg(m);
  const ls = L.legState(leg, m.settings.start, m.players.length, m.settings.doubleOut);
  const p = ls.toThrow;
  m.pending.push(code);
  ui.mod = 1;
  const r = L.x01Turn(ls.remaining[p], m.pending, m.settings.doubleOut);
  if (r.bust || r.finished || m.pending.length === 3) {
    leg.turns.push({ p, darts: m.pending, at: now() });
    m.pending = [];
    if (r.bust) { celebrate('BUST', `${m.players[p].name} blijft op ${ls.remaining[p]}`, 'bust'); beep('bust'); haptic([60, 40, 60]); }
    else if (r.finished) return legWon(m, p, r.scored);
    else turnCelebration(r.scored);
  }
  save();
  render();
}

function legWon(m, p, checkoutScore) {
  const st = L.matchState(m);
  if (st.winner !== null) {
    const { pending, ...clean } = m;
    const badgesBefore = new Map(m.players.filter(x => x.id).map(x => [x.id, earnedBadges(data, x.id)]));
    data.matches.push({ ...clean, finishedAt: now() });
    data.active.match = null;
    save();
    const me = data.activePlayerId;
    const newBadges = badgesBefore.has(me) ? [...earnedBadges(data, me)].filter(b => !badgesBefore.get(me).has(b)) : [];
    ui.result = { id: m.id, newBadges };
    go('result-match');
    celebrate('GAME SHOT!', `${m.players[p].name} wint met ${checkoutScore} uit`, 'win');
    beep('win');
    return;
  }
  const last = currentLeg(m);
  m.legs.push({ starter: (last.starter + 1) % m.players.length, turns: [] });
  save();
  render();
  celebrate('LEG!', `${m.players[p].name} gooit ${checkoutScore} uit · ${st.won.join('–')}`, 'win');
  beep('win');
}

function undoMatch() {
  const m = data.active.match;
  if (!m) return;
  if (m.pending.length) { m.pending.pop(); save(); return render(); }
  let leg = currentLeg(m);
  if (!leg.turns.length && m.legs.length > 1) { m.legs.pop(); leg = currentLeg(m); }
  if (!leg.turns.length) return toast('Er is nog niets om te wissen.');
  const turn = leg.turns.pop();
  m.pending = turn.darts.slice(0, -1);
  save();
  render();
}

function stopMatch() {
  const m = data.active.match;
  if (!m) return;
  const thrown = m.legs.some(l => l.turns.length) || m.pending.length;
  confirmBox('Wedstrijd stoppen?', thrown ? 'De wedstrijd wordt bewaard als "gestopt" en telt mee in je statistieken.' : 'Er is nog niet gegooid; de wedstrijd wordt niet bewaard.', 'Stoppen', () => {
    if (thrown) {
      const { pending, ...clean } = m;
      if (pending.length) currentLeg(clean).turns.push({ p: L.legState(currentLeg(clean), m.settings.start, m.players.length, m.settings.doubleOut).toThrow, darts: pending, at: now() });
      clean.legs = clean.legs.filter(l => l.turns.length);
      data.matches.push({ ...clean, finishedAt: now(), stopped: true });
    }
    data.active.match = null;
    save();
    closeModal();
    go('home');
  });
}

function exportBackup() {
  const blob = new Blob([S.makeBackup(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `oche-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Back-up gedownload. Bewaar het bestand goed (bijv. in iCloud of Google Drive).');
}

async function importBackup(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast('Dit bestand is te groot voor een OCHE-back-up.', 'error');
  const r = S.parseBackup(await file.text());
  if (r.error) return toast(r.error, 'error');
  const inc = r.data;
  modal(`<h3>Back-up terugzetten</h3>
    <p>In dit bestand: <b>${inc.players.length}</b> speler(s), <b>${inc.trainings.length}</b> trainingen en <b>${inc.matches.length}</b> wedstrijden.</p>
    <p class="muted">Samenvoegen voegt alleen ontbrekende dingen toe. Vervangen wist eerst alles wat nu op dit toestel staat.</p>
    <div class="modal-actions col">
      <button class="btn primary" data-act="import-merge">Samenvoegen (veilig)</button>
      <button class="btn danger" data-act="import-replace">Alles vervangen</button>
      <button class="btn ghost" data-act="modal-close">Annuleren</button></div>`);
  importBackup.pending = inc;
}

function switchPlayerModal() {
  modal(`<h3>Wie gooit er?</h3><ul class="pick">${data.players.map(p => `<li><button class="pick-btn ${p.id === data.activePlayerId ? 'on' : ''}" data-act="use-player" data-arg="${esc(p.id)}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button></li>`).join('')}</ul>
    <form data-form="add-player" class="guest"><input name="name" maxlength="24" placeholder="Nieuwe speler" aria-label="Naam nieuwe speler"><button class="btn secondary">+ Toevoegen</button></form>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Sluiten</button></div>`);
}

const ACTIONS = {
  'modal-close': closeModal,
  'modal-ok': () => confirmBox.ok?.(),
  'switch-player': switchPlayerModal,
  'use-player': id => {
    if (data.active.training || data.active.match) {
      // lopende sessies blijven bij hun eigen speler; alleen de actieve speler wisselt
    }
    data.activePlayerId = id;
    ui.match.players = [];
    save(); closeModal(); render();
    toast(`${player().name} is nu actief.`);
  },
  'setup-turns': v => { ui.setup.kind = 'score'; ui.setup.turns = Number(v); render(); },
  'start-score': startScore,
  'start-clock': startClock,
  'resume-training': () => { const t = data.active.training; if (t) { data.activePlayerId = t.playerId; go(t.kind === 'clock' ? 'play-clock' : 'play-score'); } },
  'resume-match': () => data.active.match && go('play-match'),
  'mod': v => { const n = Number(v); ui.mod = ui.mod === n ? 1 : n; haptic(5); render(); },
  'key': v => {
    const n = Number(v);
    let code;
    if (n === 0) code = 'M';
    else if (n === 25) code = 'SB';
    else if (n === 50) code = 'DB';
    else code = (ui.mod === 2 ? 'D' : ui.mod === 3 ? 'T' : 'S') + n;
    addDart(code);
  },
  'undo': undo,
  'toggle-type': () => { ui.typing = !ui.typing; render(); },
  'pause': () => { save(); go('home'); toast('Gepauzeerd. Je kunt later verder via Home.'); },
  'finish-training': () => {
    const t = data.active.training;
    if (!t.turns.length && !t.pending.length) { data.active.training = null; save(); return go('home'); }
    const lim = L.trainingLimitDarts(t);
    const text = lim ? `Je hebt ${L.trainingTotals(t).darts + t.pending.length} van de ${lim} pijlen gegooid. De training wordt bewaard zoals hij nu is.` : 'De training wordt bewaard in je geschiedenis.';
    confirmBox('Training afronden?', text, 'Bewaren', () => { closeModal(); finishActiveTraining(true); }, false);
  },
  'again': () => {
    const t = data.trainings.find(x => x.id === ui.result?.id);
    if (t?.kind === 'clock') return startClock();
    if (t) { ui.setup.turns = t.limitTurns || 0; if (![0, 10, 20, 33].includes(ui.setup.turns)) { ui.setup.custom = ui.setup.turns; ui.setup.turns = -1; } }
    startScore();
  },
  'match-set': v => {
    const [k, val] = v.split(':');
    ui.match[k] = k === 'doubleOut' ? val === 'true' : Number(val);
    render();
  },
  'mp-add': id => { const p = player(id); if (p && ui.match.players.length < 4) ui.match.players.push({ id: p.id, name: p.name }); render(); },
  'mp-remove': i => { ui.match.players.splice(Number(i), 1); render(); },
  'mp-up': i => { const a = ui.match.players; const n = Number(i); [a[n - 1], a[n]] = [a[n], a[n - 1]]; render(); },
  'start-match': () => {
    if (data.active.match) return void confirmBox('Lopende wedstrijd', 'Er loopt nog een wedstrijd. Die wordt gestopt en bewaard als je een nieuwe start.', 'Nieuwe starten', () => {
      const m = data.active.match; const { pending, ...clean } = m; clean.legs = clean.legs.filter(l => l.turns.length);
      if (clean.legs.length) data.matches.push({ ...clean, finishedAt: now(), stopped: true });
      data.active.match = null; closeModal(); startMatch();
    }, false);
    startMatch();
  },
  'stop-match': stopMatch,
  'rematch': () => {
    const m = data.matches.find(x => x.id === ui.result?.id);
    if (m) { ui.match = { start: m.settings.start, bestOf: m.settings.bestOf, doubleOut: m.settings.doubleOut, players: m.players.length > 1 ? [...m.players.slice(1), m.players[0]] : [...m.players] }; }
    startMatch();
  },
  'stats-set': v => { const [k, val] = v.split(':'); ui[k] = val; render(); },
  'stats-last10': () => { ui.statsLast10 = !ui.statsLast10; render(); },
  'open-training': id => { const t = data.trainings.find(x => x.id === id); if (t) trainingDetail(t); },
  'open-match': id => { const m = data.matches.find(x => x.id === id); if (m) matchDetail(m); },
  'delete-training': id => confirmBox('Training verwijderen?', 'Deze training verdwijnt definitief uit je geschiedenis en statistieken.', 'Verwijderen', () => {
    data.trainings = data.trainings.filter(t => t.id !== id); save(); closeModal(); render(); toast('Training verwijderd.');
  }),
  'delete-match': id => confirmBox('Wedstrijd verwijderen?', 'Deze wedstrijd verdwijnt definitief.', 'Verwijderen', () => {
    data.matches = data.matches.filter(m => m.id !== id); save(); closeModal(); render(); toast('Wedstrijd verwijderd.');
  }),
  'rename-player': id => {
    const p = player(id);
    modal(`<h3>Naam wijzigen</h3><form data-form="rename" data-arg="${esc(id)}"><input name="name" maxlength="24" value="${esc(p.name)}" aria-label="Nieuwe naam" required><div class="modal-actions"><button type="button" class="btn ghost" data-act="modal-close">Annuleren</button><button class="btn primary">Opslaan</button></div></form>`);
  },
  'delete-player': id => {
    const p = player(id);
    const n = data.trainings.filter(t => t.playerId === id).length;
    confirmBox(`${p.name} verwijderen?`, `Ook ${n} training(en) van ${p.name} worden verwijderd. Wedstrijden blijven bewaard. Tip: maak eerst een back-up.`, 'Verwijderen', () => {
      data.players = data.players.filter(x => x.id !== id);
      data.trainings = data.trainings.filter(t => t.playerId !== id);
      data.matches.forEach(m => m.players.forEach(mp => { if (mp.id === id) mp.id = null; }));
      if (data.active.training?.playerId === id) data.active.training = null;
      if (data.activePlayerId === id) data.activePlayerId = data.players[0].id;
      ui.match.players = [];
      save(); closeModal(); render();
    });
  },
  'export': exportBackup,
  'import-merge': () => { data = S.mergeData(data, importBackup.pending); sanitizeActive(); save(); closeModal(); render(); toast('Back-up samengevoegd.'); },
  'import-replace': () => confirmBox('Echt alles vervangen?', 'Alles wat nu op dit toestel staat wordt overschreven door de back-up.', 'Ja, vervangen', () => {
    data = importBackup.pending; sanitizeActive(); save(); closeModal(); render(); toast('Back-up teruggezet.');
  }),
  'theme': v => { data.settings.theme = v; applyTheme(); save(); render(); },
  'install': async () => { const e = ui.installEvent; if (!e) return; e.prompt(); await e.userChoice; ui.installEvent = null; render(); },
};

const FORMS = {
  welcome: fd => {
    const name = S.cleanName(fd.get('name'));
    if (!name) return toast('Vul je naam in.');
    const p = S.newPlayer(name, data.players.length);
    data.players.push(p);
    data.activePlayerId = p.id;
    save();
    go('home');
  },
  'add-player': fd => {
    const name = S.cleanName(fd.get('name'));
    if (!name) return toast('Vul een naam in.');
    if (data.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return toast('Die naam bestaat al.');
    const p = S.newPlayer(name, data.players.length);
    data.players.push(p);
    save();
    closeModal();
    render();
    toast(`${name} toegevoegd.`);
  },
  guest: fd => {
    const name = S.cleanName(fd.get('name'));
    if (!name) return toast('Vul een naam in.');
    const prof = data.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (ui.match.players.length < 4) ui.match.players.push(prof && !ui.match.players.some(x => x.id === prof.id) ? { id: prof.id, name: prof.name } : { id: null, name });
    render();
  },
  rename: (fd, form) => {
    const name = S.cleanName(fd.get('name'));
    const p = player(form.dataset.arg);
    if (!name || !p) return;
    p.name = name;
    data.matches.forEach(m => m.players.forEach(mp => { if (mp.id === p.id) mp.name = name; }));
    save(); closeModal(); render();
  },
  type: (fd) => {
    const r = L.parseLine(fd.get('line'));
    if (r.error) return toast(r.error, 'error');
    const pend = ui.view === 'play-match' ? data.active.match.pending : data.active.training.pending;
    const room = 3 - pend.length;
    if (!r.codes.length) return;
    if (r.codes.length > room) return toast(`Je kunt nog ${room} pijl${room === 1 ? '' : 'en'} invoeren in deze beurt.`, 'error');
    for (const c of r.codes) { ui.lastTap = 0; addDart(c); if (!PLAY_VIEWS.has(ui.view)) break; }
    ui.typing = true;
    render();
  },
};

function applyTheme() {
  document.documentElement.dataset.theme = data.settings.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', data.settings.theme === 'light' ? '#f6f1e7' : '#07120d');
}

// ---------- Event-delegatie ----------
document.addEventListener('click', e => {
  const goEl = e.target.closest('[data-go]');
  if (goEl) { e.preventDefault(); closeModal(); return go(goEl.dataset.go); }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset.arg); }
});

document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  FORMS[form.dataset.form]?.(new FormData(form), form);
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.input === 'import') { importBackup(el.files[0]); el.value = ''; }
  if (el.dataset.input === 'setting') { data.settings[el.dataset.arg] = el.checked; save(); }
  if (el.dataset.input === 'custom-turns') { ui.setup.custom = Math.max(1, Math.min(200, Number(el.value) || 1)); render(); }
});

// Toetsenbord op desktop: cijfers typen gaat via het typvak; Escape sluit een venster.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  if (PLAY_VIEWS.has(ui.view) && !ui.typing && $('#modal').hidden && /^[0-9a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
    ui.typing = true; render();
  }
});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.installEvent = e; if (ui.view === 'more') render(); });

// ---------- Start ----------
applyTheme();
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if (loaded.source === 'legacy') { save(); setTimeout(() => toast('Je trainingen uit Dartlog zijn overgezet naar OCHE.'), 600); }
const at = data.active.training;
if (at) ui.view = at.kind === 'clock' ? 'play-clock' : 'play-score';
else if (data.active.match) ui.view = 'play-match';
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated' && hadController) toast('OCHE is bijgewerkt. Herstart de app voor de nieuwste versie.');
      });
    });
  }).catch(() => {});
}

// Voor tests
window.__oche = { get data() { return data; }, L };
