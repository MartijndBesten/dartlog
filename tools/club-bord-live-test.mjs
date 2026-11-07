// Live test "Club bij het bord" tegen een echte API (staging of productie), met tijdelijke testaccounts en een tijdelijke
// club die ALTIJD weer worden verwijderd (ook na een fout). Raakt geen echte gebruikers of clubs.
//   node tools/club-bord-live-test.mjs [api-basis] [origin]
// Controleert: hoofd-bordcode (goedkeuren), direct toelaten, persoonlijke uitnodiging (eenmalig, geen naam in preview),
// automatisch meetellen (challenge 'auto'), vernieuwen (oude code ongeldig), 16+, beheerrechten, oude 1.10.0-routes.
// De IP-limiet (5 per minuut) wordt gerespecteerd: bij 429 wachten en opnieuw.
const API = process.argv[2] || 'https://okkie-api.zaalverhuur-sion.workers.dev';
const ORIGIN = process.argv[3] || 'https://app.okkiedarts.nl';
const tag = 'ZZ bordtest ' + Math.random().toString(36).slice(2, 7);
const made = { tokens: [], club: null, admin: null };
let step = 0;
const ok = (cond, msg) => { step++; if (!cond) throw new Error(`stap ${step} mislukt: ${msg}`); console.log(`✔ ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, { method = 'GET', body, token } = {}) {
  for (let i = 0; ; i++) {
    const headers = { Origin: ORIGIN };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text();
    if (r.status === 429 && i < 8) { await sleep(15000); continue; }
    let json = null; try { json = JSON.parse(text); } catch { /* leeg */ }
    return { status: r.status, json };
  }
}
async function register(nick, extra) {
  const r = await call('/v1/register', { method: 'POST', body: { nickname: nick, age: 'adult', ...extra } });
  if (r.status === 201) made.tokens.push(r.json.token);
  return r;
}
const join = (tok, code) => call('/v1/clubs/join', { method: 'POST', token: tok, body: { code, consent: true } });
const preview = code => call('/v1/clubs/preview', { method: 'POST', body: { code } });

try {
  const h = await call('/v1/health');
  ok(h.status === 200 && h.json.clubs === true, `API ${API} bereikbaar, Club aan`);
  const A = await register('ZZ Beheer', { clubFounder: true });
  ok(A.status === 201, 'beheerder-account');
  const c = await call('/v1/clubs', { method: 'POST', token: A.json.token, body: { name: tag, consent: true } });
  ok(c.status === 201, 'club opgericht');
  made.club = c.json.club.id; made.admin = A.json.token;
  const code0 = c.json.club.inviteCode;
  let club = await call('/v1/clubs/' + made.club, { token: made.admin });
  ok(club.json.club.codes?.length === 1 && club.json.club.codes[0].code === code0 && club.json.club.codes[0].primary && !club.json.club.codes[0].direct,
    'nieuwe club: één hoofd-bordcode = inviteCode, standaard eerst goedkeuren');
  ok((await preview(code0)).json.code.direct === false, 'preview: code met goedkeuring');

  const minor = await call('/v1/register', { method: 'POST', body: { nickname: 'ZZ jong', age: 'minor', clubCode: code0 } });
  ok(minor.status === 403, 'onder 16 kan niet via de clubcode registreren (403)');

  const B = await register('ZZ Wacht', { clubCode: code0 });
  const jb = await join(B.json.token, code0);
  ok(jb.status === 201 && jb.json.status === 'pending', 'scannen met standaardinstelling = aanmelding (pending)');
  ok((await call('/v1/clubs/' + made.club, { token: B.json.token })).status === 404, 'wachtend lid ziet de club niet');

  const patch = await call(`/v1/clubs/${made.club}/codes/${code0}`, { method: 'PATCH', token: made.admin, body: { direct: true, label: 'Bord 1' } });
  ok(patch.status === 200, 'beheerder zet "direct toelaten" aan');
  const forbidden = await call(`/v1/clubs/${made.club}/codes`, { token: B.json.token });
  ok(forbidden.status === 404, 'wachtend lid kan de codes niet zien');
  const C = await register('ZZ Direct', { clubCode: code0 });
  const jc = await join(C.json.token, code0);
  ok(jc.status === 201 && jc.json.status === 'active', 'scannen met direct toelaten = meteen lid');

  // Weekoefening (deze week, of volgende als deze week al dicht is) en automatisch meetellen.
  let ch = await call(`/v1/clubs/${made.club}/challenge`, { method: 'PUT', token: made.admin, body: { kind: 'score30' } });
  if (ch.status === 409) ch = await call(`/v1/clubs/${made.club}/challenge`, { method: 'PUT', token: made.admin, body: { kind: 'score30', week: 'next' } });
  ok(ch.status === 200, 'weekoefening ingesteld');
  const auto = (id, kind, darts, points) => call(`/v1/clubs/${made.club}/trainings`, { method: 'POST', token: C.json.token,
    body: { training: { trainingId: id, kind, darts, points, high: 60 }, feed: true, challenge: 'auto' } });
  const a1 = await auto('zz-' + Date.now(), 'score60', 60, 1200);
  ok(a1.status === 201 && a1.json.feed === true && !a1.json.challenge, "challenge 'auto' met een andere soort: alleen feed, geen fout");
  const a2 = await auto('zz2-' + Date.now(), 'score30', 30, 600);
  ok(a2.status === 201 && a2.json.feed === true, "challenge 'auto' met de weekoefening: geaccepteerd");
  const mc = await call('/v1/clubs/' + made.club, { token: C.json.token });
  ok(mc.status === 200 && mc.json.club.codes === undefined, 'lid ziet de club, maar geen codes');

  const inv = await call(`/v1/clubs/${made.club}/codes`, { method: 'POST', token: made.admin, body: { kind: 'personal', label: 'ZZ Persoon' } });
  ok(inv.status === 201 && /^[A-HJKMNP-Z2-9]{10}$/.test(inv.json.code.code), 'persoonlijke uitnodiging (10 tekens)');
  const pvi = await preview(inv.json.code.code);
  ok(pvi.json.code.kind === 'personal' && pvi.json.code.label === '', 'preview van de uitnodiging toont geen naam');
  const D = await register('ZZ Uitgenodigd', { clubCode: inv.json.code.code });
  ok((await join(D.json.token, inv.json.code.code)).json.status === 'active', 'uitnodiging: direct lid');
  ok((await join(B.json.token, inv.json.code.code)).status === 404, 'uitnodiging werkt maar één keer');

  const rn = await call(`/v1/clubs/${made.club}/codes/${code0}/renew`, { method: 'POST', token: made.admin });
  ok(rn.status === 200 && rn.json.code !== code0, 'bordcode vernieuwd');
  ok((await preview(code0)).status === 404, 'oude QR-code werkt niet meer');
  const pvn = await preview(rn.json.code);
  ok(pvn.status === 200 && pvn.json.code.direct === true && pvn.json.code.label === 'Bord 1', 'nieuwe code met dezelfde instellingen');
  club = await call('/v1/clubs/' + made.club, { token: made.admin });
  ok(club.json.club.inviteCode === rn.json.code, 'inviteCode (iOS 1.10.0) volgt de nieuwe hoofdcode');
  const old = await call(`/v1/clubs/${made.club}/code`, { method: 'POST', token: made.admin });
  ok(old.status === 200 && (await preview(rn.json.code)).status === 404, 'oude route /code (iOS 1.10.0) vernieuwt ook');
  ok((await call(`/v1/clubs/${made.club}/codes/${old.json.inviteCode}`, { method: 'DELETE', token: made.admin })).status === 409, 'hoofdcode kan niet weg');
} catch (e) {
  console.error('✖ ' + e.message);
  process.exitCode = 1;
} finally {
  if (made.club && made.admin) { const r = await call('/v1/clubs/' + made.club, { method: 'DELETE', token: made.admin }); console.log(`opruimen club: ${r.status}`); }
  for (const t of made.tokens) { const r = await call('/v1/me', { method: 'DELETE', token: t }); console.log(`opruimen account: ${r.status}`); }
  let left = 0;
  for (const t of made.tokens) { const r = await call('/v1/me', { token: t }); if (!(r.status === 401 || r.status === 404)) left++; }
  console.log(left ? `✖ ${left} testaccount(s) bestaan nog` : `✔ alle ${made.tokens.length} testaccounts en de testclub verwijderd`);
  if (left) process.exitCode = 1;
}
