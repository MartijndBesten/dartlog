// Hulp & feedback (app: Meer → Hulp & feedback). Meldingen komen in D1 (tabel feedback, migratie 0005) en zijn te lezen
// in een besloten inbox op deze Worker: /v1/feedback/inbox#key=<FEEDBACK_KEY>. Zonder het geheim FEEDBACK_KEY is de
// inbox dicht (404). E-mail versturen kan pas als er een maildienst gekoppeld is (zie cloud/FEEDBACK.md); tot die tijd
// is de inbox de plek waar meldingen binnenkomen.
// Bescherming tegen misbruik: alleen vanaf de app-adressen (CORS/Origin, in worker.js), honeypotveld, minimale
// invultijd, per minuut (RL_REGISTER) en per dag (gehasht IP met datum) beperkt, vaste maximale groottes.
import { usageOverview } from './usage.js';

export const FEEDBACK_LIMITS = { message: 2000, contact: 120, screenshot: 700_000, perDay: 10, keepDays: 180, minMs: 2000 };

const clean = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '';
const SHOT = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

async function readJson(request, max) {
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) throw new Error('Verkeerd inhoudstype.');
  if (Number(request.headers.get('Content-Length') || '0') > max) throw new Error('Het verzoek is te groot.');
  const raw = await request.text();
  if (raw.length > max) throw new Error('Het verzoek is te groot.');
  return JSON.parse(raw);
}

// Alleen deze technische velden worden bewaard; alles is tekst met een vaste maximale lengte.
function cleanMeta(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const out = {
    version: clean(m.version, 20), device: clean(m.device, 120), display: clean(m.display, 60),
    lang: clean(m.lang, 20), installed: m.installed === true,
    errors: Array.isArray(m.errors) ? m.errors.slice(0, 5).map(e => clean(e, 300)).filter(Boolean) : [],
  };
  return JSON.stringify(out);
}

const dayKey = () => new Date().toISOString().slice(0, 10);
async function keyOk(request, env, h) {
  if (!env.FEEDBACK_KEY || env.FEEDBACK_KEY.length < 32) return false;
  const given = request.headers.get('Authorization')?.match(/^Bearer (\S{32,200})$/)?.[1];
  return !!given && await h.hash(given) === await h.hash(env.FEEDBACK_KEY);
}

// Openbare route: melding insturen (alleen POST vanaf de app-origins; dat controleert worker.js al).
export async function handleFeedback(request, env, path, h, cors) {
  if (path !== '/v1/feedback' || request.method !== 'POST') return null;
  const ip = h.clientIp(request);
  if (await h.limited(env.RL_REGISTER, 'feedback:' + ip)) return h.fail('Je hebt net al iets gestuurd. Probeer het over een minuut opnieuw.', 429, cors);
  let body;
  try { body = await readJson(request, 760_000); } catch (e) { return h.fail(e instanceof SyntaxError ? 'Ongeldig verzoek.' : e.message, 400, cors); }
  // Honeypot: mensen zien dit veld niet. Doen alsof het gelukt is, maar niets bewaren.
  if (clean(body.website, 200)) return h.json({ ok: true }, 201, cors);
  if (!Number.isFinite(body.elapsed) || body.elapsed < FEEDBACK_LIMITS.minMs) return h.fail('Dat ging erg snel. Controleer je bericht en verstuur het nog een keer.', 400, cors);
  const kind = body.kind === 'idee' ? 'idee' : body.kind === 'probleem' ? 'probleem' : null;
  const message = clean(body.message, FEEDBACK_LIMITS.message + 1);
  if (!kind) return h.fail('Kies: probleem of idee.', 400, cors);
  if (message.length < 5) return h.fail('Schrijf iets meer: wat ging er mis of wat is je idee?', 400, cors);
  if (message.length > FEEDBACK_LIMITS.message) return h.fail(`Je bericht is te lang (maximaal ${FEEDBACK_LIMITS.message} tekens).`, 400, cors);
  const contact = clean(body.contact, FEEDBACK_LIMITS.contact) || null;
  const shot = typeof body.screenshot === 'string' && body.screenshot ? body.screenshot : null;
  if (shot && (shot.length > FEEDBACK_LIMITS.screenshot || !SHOT.test(shot))) return h.fail('De schermafbeelding is te groot of geen afbeelding.', 400, cors);
  const ipDay = await h.hash('feedback|' + dayKey() + '|' + ip + '|' + (env.FEEDBACK_KEY || ''));
  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM feedback WHERE ip_day_hash = ?').bind(ipDay).first();
  if ((today?.n || 0) >= FEEDBACK_LIMITS.perDay) return h.fail('Vandaag zijn er al veel meldingen vanaf dit adres verstuurd. Probeer het morgen opnieuw.', 429, cors);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO feedback(id, created_at, kind, message, contact, meta, screenshot, ip_day_hash) VALUES(?, datetime('now'), ?, ?, ?, ?, ?, ?)")
    .bind(id, kind, message, contact, cleanMeta(body.meta), shot, ipDay).run();
  return h.json({ ok: true, id }, 201, cors);
}

// Besloten inbox. Draait vóór de Origin-controle van worker.js: de inbox staat op het adres van de Worker zelf.
export async function handleFeedbackAdmin(request, env, path, h) {
  if (!path.startsWith('/v1/feedback/')) return null;
  const headers = { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!env.FEEDBACK_KEY) return h.fail('Niet gevonden.', 404, headers);
  if (path === '/v1/feedback/inbox' && request.method === 'GET') {
    return new Response(INBOX_HTML, { status: 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } });
  }
  if (!path.startsWith('/v1/feedback/admin/')) return null;
  if (!await keyOk(request, env, h)) return h.fail('Geen toegang.', 403, headers);
  // Gebruik van de app (anonieme dagteller, usage.js): zelfde sleutel als de inbox.
  if (request.method === 'GET' && path === '/v1/feedback/admin/usage') return h.json({ usage: await usageOverview(env) }, 200, headers);
  if (request.method === 'GET' && path === '/v1/feedback/admin/list') {
    const rows = await env.DB.prepare('SELECT id, created_at AS createdAt, kind, message, contact, meta, handled, screenshot IS NOT NULL AS hasShot FROM feedback ORDER BY created_at DESC LIMIT 200').all();
    return h.json({ items: (rows.results || []).map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null, handled: !!r.handled, hasShot: !!r.hasShot })) }, 200, headers);
  }
  if (request.method === 'GET' && path === '/v1/feedback/admin/shot') {
    const row = await env.DB.prepare('SELECT screenshot FROM feedback WHERE id = ?').bind(new URL(request.url).searchParams.get('id') || '').first();
    return row?.screenshot ? h.json({ screenshot: row.screenshot }, 200, headers) : h.fail('Niet gevonden.', 404, headers);
  }
  // Wijzigen alleen vanaf de inboxpagina zelf (zelfde herkomst).
  if (request.method === 'POST' && request.headers.get('Origin') === new URL(request.url).origin) {
    let body; try { body = await readJson(request, 2000); } catch { return h.fail('Ongeldig verzoek.', 400, headers); }
    const id = typeof body.id === 'string' ? body.id : '';
    if (path === '/v1/feedback/admin/handled') {
      await env.DB.prepare('UPDATE feedback SET handled = ? WHERE id = ?').bind(body.handled ? 1 : 0, id).run();
      return h.json({ ok: true }, 200, headers);
    }
    if (path === '/v1/feedback/admin/delete') {
      await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
      return h.json({ ok: true }, 200, headers);
    }
  }
  return h.fail('Niet gevonden.', 404, headers);
}

export async function cleanupFeedback(env) {
  return env.DB.prepare('DELETE FROM feedback WHERE created_at < datetime(\'now\', ?)').bind(`-${FEEDBACK_LIMITS.keepDays} days`).run();
}

const INBOX_HTML = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>OKKIE. · meldingen</title>
<style>
:root{color-scheme:dark;--bg:#07120d;--s:#0e1f16;--l:#1d3628;--t:#f3eedf;--m:#93a99c;--a:#b8ff3c;--r:#ff5a52}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:15px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:auto;padding:20px 16px 60px}h1{font-size:22px;margin:0 0 4px}.muted{color:var(--m)}
.item{background:var(--s);border:1px solid var(--l);border-radius:14px;padding:14px;margin:12px 0}.item.done{opacity:.55}
.head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px}.tag{font-weight:800;border-radius:99px;padding:2px 10px;background:var(--a);color:#0b1a06}
.tag.probleem{background:var(--r);color:#fff}.msg{white-space:pre-wrap;margin:10px 0;font-size:16px}pre{white-space:pre-wrap;font-size:12px;color:var(--m);margin:6px 0 0}
button{font:inherit;border:1px solid var(--l);background:#14291e;color:var(--t);border-radius:9px;padding:7px 12px;cursor:pointer;margin:8px 8px 0 0}
img{max-width:100%;border-radius:10px;margin-top:10px;border:1px solid var(--l)}
h2{font-size:18px;margin:26px 0 8px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.card{background:var(--s);border:1px solid var(--l);border-radius:14px;padding:12px;min-width:0}
.card strong{display:block;font-size:30px;line-height:1.1;margin:4px 0}.card small{display:block;color:var(--m);font-size:12px;line-height:1.3}
.bars{display:flex;align-items:flex-end;gap:3px;height:150px;margin:12px 0 4px;padding:0 2px}.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;min-width:0}
.bar i{display:block;width:100%;background:var(--a);border-radius:3px 3px 0 0;min-height:2px}.bar.z i{background:var(--l)}.bar b{font-size:10px;line-height:1.4}.bar small{font-size:9px;color:var(--m)}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}td,th{text-align:left;padding:6px 4px;border-top:1px solid var(--l)}th{color:var(--m);font-weight:600;border-top:0}td:not(:first-child),th:not(:first-child){text-align:right}
.notes{font-size:12px;color:var(--m);padding-left:18px;margin:8px 0 0}.notes li{margin:3px 0}
</style></head><body><main><h1>OKKIE. · beheer</h1><p class="muted" id="st">Laden…</p>
<section id="usage" hidden><h2>Gebruik van de app <span class="muted" style="font-weight:400;font-size:13px">anonieme dagteller</span></h2>
<div class="cards">
<div class="card"><small>Meldingen vandaag (UTC)</small><strong id="u-today">–</strong><small id="u-today-sub">toestellen die vandaag meldden, max. 1 per toestel</small></div>
<div class="card"><small>Nieuwe toestellen sinds de teller</small><strong id="u-devices">–</strong><small id="u-devices-sub">–</small></div>
<div class="card"><small>Meldingen laatste 7 dagen</small><strong id="u-week">–</strong><small id="u-week-sub">–</small></div>
<div class="card"><small>Meldingen laatste 30 dagen</small><strong id="u-month">–</strong><small id="u-month-sub">–</small></div>
</div>
<h2>Meldingen per dag <span class="muted" style="font-weight:400;font-size:13px">laatste 30 dagen · tussen haakjes nieuwe toestellen</span></h2>
<div class="bars" id="u-days"></div>
<h2>Per appversie</h2>
<table><thead><tr><th>Versie</th><th>7 dagen</th><th>30 dagen</th><th>Nieuw (30 d)</th></tr></thead><tbody id="u-versions"></tbody></table>
<ul class="notes" id="u-notes"></ul>
<p class="muted" id="u-status"></p></section>
<h2>Meldingen uit Hulp &amp; feedback</h2><div id="list"></div></main>
<script>
const st=document.getElementById('st'),list=document.getElementById('list');
const k=(location.hash.match(/key=([^&]+)/)||[])[1]||sessionStorage.getItem('okkie-fb');
if(k){sessionStorage.setItem('okkie-fb',k);history.replaceState(null,'',location.pathname);}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const api=(p,o={})=>fetch(p,{...o,headers:{Authorization:'Bearer '+k,'Content-Type':'application/json'}}).then(r=>r.ok?r.json():Promise.reject(r.status));
const f=n=>new Intl.NumberFormat('nl-NL').format(Number(n||0)),$=id=>document.getElementById(id);
async function usage(){
  if(!k)return;
  try{const {usage:u}=await api('/v1/feedback/admin/usage');
    $('usage').hidden=false;
    $('u-today').textContent=f(u.today.opens);$('u-today-sub').textContent='toestellen die vandaag meldden (max. 1 per toestel) · '+f(u.today.newDevices)+' nieuw';
    $('u-devices').textContent=f(u.totals.devices);$('u-devices-sub').textContent=(u.totals.since?'sinds '+u.totals.since+' · ':'')+f(u.totals.opens)+' meldingen in totaal · geen installaties, geen unieke personen';
    $('u-week').textContent=f(u.week.opens);$('u-week-sub').textContent='gemiddeld '+(u.week.opens/7).toFixed(1).replace('.',',')+' per dag · '+f(u.week.newDevices)+' nieuwe toestellen';
    $('u-month').textContent=f(u.month.opens);$('u-month-sub').textContent='gemiddeld '+(u.month.opens/30).toFixed(1).replace('.',',')+' per dag · '+f(u.month.newDevices)+' nieuwe toestellen';
    const byDay=Object.fromEntries((u.days||[]).map(d=>[d.day,d]));const max=Math.max(1,...(u.days||[]).map(d=>Number(d.opens)||0));
    $('u-days').innerHTML='';
    for(let i=29;i>=0;i--){const dt=new Date(Date.now()-i*864e5).toISOString().slice(0,10);const d=byDay[dt]||{opens:0,newDevices:0};
      $('u-days').insertAdjacentHTML('beforeend','<div class="bar'+(d.opens?'':' z')+'" title="'+dt+': '+d.opens+' meldingen, '+d.newDevices+' nieuw"><i style="height:'+Math.max(2,Math.round((Number(d.opens)||0)/max*100))+'%"></i><b>'+(d.opens?f(d.opens)+(d.newDevices?' ('+d.newDevices+')':''):'')+'</b><small>'+dt.slice(8)+'</small></div>');}
    const w=Object.fromEntries((u.versions7||[]).map(v=>[v.version,v.opens]));
    $('u-versions').innerHTML=(u.versions30||[]).map(v=>'<tr><td>'+esc(v.version)+'</td><td>'+f(w[v.version])+'</td><td>'+f(v.opens)+'</td><td>'+f(v.newDevices)+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">Nog geen meldingen.</td></tr>';
    $('u-notes').innerHTML=(u.notes||[]).map(n=>'<li>'+esc(n)+'</li>').join('');
  }catch(e){$('u-status').textContent=e===403?'':'Gebruik laden mislukt ('+e+').';}
}
async function load(){
  if(!k){st.textContent='Open de inbox met de geheime link.';return;}
  try{const {items}=await api('/v1/feedback/admin/list');
    st.textContent=items.length?items.filter(i=>!i.handled).length+' open, '+items.length+' totaal (meldingen worden na 180 dagen gewist)':'Nog geen meldingen.';
    list.innerHTML=items.map(i=>'<div class="item'+(i.handled?' done':'')+'" data-id="'+esc(i.id)+'"><div class="head"><span class="tag '+esc(i.kind)+'">'+esc(i.kind)+'</span><span class="muted">'+esc(new Date(i.createdAt.replace(' ','T')+'Z').toLocaleString('nl-NL'))+'</span>'+(i.contact?'<span>· '+esc(i.contact)+'</span>':'')+'</div>'
      +'<div class="msg">'+esc(i.message)+'</div>'+(i.meta?'<pre>'+esc(JSON.stringify(i.meta,null,1))+'</pre>':'')
      +(i.hasShot?'<button data-shot>Schermafbeelding tonen</button>':'')+'<button data-done>'+(i.handled?'Weer open':'Afgehandeld')+'</button><button data-del>Verwijderen</button></div>').join('');
  }catch(e){st.textContent=e===403?'Geen toegang: de sleutel klopt niet.':'Laden mislukt ('+e+').';}
}
list.addEventListener('click',async e=>{const it=e.target.closest('.item');if(!it)return;const id=it.dataset.id;
  if(e.target.matches('[data-shot]')){const r=await api('/v1/feedback/admin/shot?id='+encodeURIComponent(id));const img=new Image();img.src=r.screenshot;e.target.replaceWith(img);}
  if(e.target.matches('[data-done]')){await api('/v1/feedback/admin/handled',{method:'POST',body:JSON.stringify({id,handled:!it.classList.contains('done')})});load();}
  if(e.target.matches('[data-del]')&&confirm('Deze melding definitief verwijderen?')){await api('/v1/feedback/admin/delete',{method:'POST',body:JSON.stringify({id})});load();}
});
load();usage();
</script></body></html>`;
