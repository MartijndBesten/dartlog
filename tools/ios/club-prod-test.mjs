// Productietest OKKIE. Club vanuit de iPhone-app (Origin capacitor://localhost) tegen de echte API, met tijdelijke
// testaccounts die altijd weer worden verwijderd (club én accounts). Raakt geen echte gebruikers.
//   node tools/ios/club-prod-test.mjs [api-basis]
// Controleert: account 16+, club oprichten, uitnodigen (code), aanvraag, niet-leden en wachtenden zien niets,
// goedkeuren, training delen in de feed, logo uploaden/ophalen/verwijderen, 16-weigering, opruimen.
const API = process.argv[2] || 'https://okkie-api.zaalverhuur-sion.workers.dev';
const ORIGIN = 'capacitor://localhost';
const tag = 'ZZ test ' + Math.random().toString(36).slice(2, 7);
const made = { tokens: [], club: null, admin: null };
let step = 0;
const ok = (cond, msg) => { step++; if (!cond) throw new Error(`stap ${step} mislukt: ${msg}`); console.log(`✔ ${msg}`); };

async function call(path, { method = 'GET', body, token, raw, type } = {}) {
  const headers = { Origin: ORIGIN };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = type;
  const r = await fetch(API + path, { method, headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* binair of leeg */ }
  return { status: r.status, json, cors: r.headers.get('access-control-allow-origin'), type: r.headers.get('content-type'), bytes: text.length };
}
async function register(nick, extra) {
  const r = await call('/v1/register', { method: 'POST', body: { nickname: nick, age: 'adult', ...extra } });
  if (r.status === 201) made.tokens.push(r.json.token);
  return r;
}
// Kleinste geldige PNG (1 × 1, groen).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

try {
  const pre = await call('/v1/health');
  ok(pre.status === 200 && pre.json.clubs === true && pre.cors === ORIGIN, 'API bereikbaar vanuit de app (CORS capacitor://localhost), Club staat aan');
  const minor = await call('/v1/register', { method: 'POST', body: { nickname: 'ZZ jong', age: 'minor', clubFounder: true } });
  ok(minor.status === 403, 'jonger dan 16 kan geen Club-account maken (403)');

  const A = await register('ZZ Beheer', { clubFounder: true });
  ok(A.status === 201 && A.json.public === false, 'beheerder-account gemaakt, niet openbaar');
  const club = await call('/v1/clubs', { method: 'POST', token: A.json.token, body: { name: tag, consent: true } });
  ok(club.status === 201 && club.json.club.inviteCode, 'club opgericht met uitnodigingscode');
  made.club = club.json.club.id; made.admin = A.json.token;

  const B = await register('ZZ Lid', { clubCode: club.json.club.inviteCode });
  ok(B.status === 201, 'lid-account gemaakt met de clubcode');
  const join = await call('/v1/clubs/join', { method: 'POST', token: B.json.token, body: { code: club.json.club.inviteCode, consent: true } });
  ok(join.status === 201 && join.json.status === 'pending', 'aanvraag om lid te worden staat open');
  const waiting = await call('/v1/clubs/' + made.club, { token: B.json.token });
  ok(waiting.status === 404, 'wachtend lid ziet de club nog niet (404)');

  const C = await register('ZZ Buiten', { clubFounder: true });
  for (const p of ['', '/feed', '/logo', '/requests']) {
    const r = await call('/v1/clubs/' + made.club + p, { token: C.json.token });
    ok(r.status === 404, `niet-lid krijgt 404 op /clubs/…${p || ''}`);
  }
  const anon = await call('/v1/clubs/' + made.club);
  ok(anon.status === 401 || anon.status === 404, 'zonder account geen toegang');

  const reqs = await call(`/v1/clubs/${made.club}/requests`, { token: A.json.token });
  const h = reqs.json.requests.find(r => r.nickname === 'ZZ Lid')?.handle;
  ok(!!h, 'beheerder ziet de aanvraag');
  const appr = await call(`/v1/clubs/${made.club}/requests/${h}`, { method: 'POST', token: A.json.token, body: { approve: true } });
  ok(appr.status === 200, 'beheerder keurt het lid goed');
  const now = await call('/v1/clubs/' + made.club, { token: B.json.token });
  ok(now.status === 200 && now.json.club.name === tag, 'goedgekeurd lid ziet de club');

  const share = await call(`/v1/clubs/${made.club}/trainings`, { method: 'POST', token: B.json.token,
    body: { training: { trainingId: 'zz-' + Date.now(), kind: 'score30', darts: 30, points: 600, high: 100 }, feed: true } });
  ok(share.status === 200 || share.status === 201, 'lid deelt een training in de clubfeed');
  const feed = await call(`/v1/clubs/${made.club}/feed`, { token: A.json.token });
  ok(feed.json.feed.some(f => f.nickname === 'ZZ Lid' && f.points === 600), 'beheerder ziet de training in de feed');
  const feedC = await call(`/v1/clubs/${made.club}/feed`, { token: C.json.token });
  ok(feedC.status === 404, 'niet-lid ziet de feed niet');

  const up = await call(`/v1/clubs/${made.club}/logo`, { method: 'PUT', token: A.json.token, raw: PNG, type: 'image/png' });
  ok(up.status === 200 && up.json.logo === true, 'clublogo (PNG) geüpload');
  const upB = await call(`/v1/clubs/${made.club}/logo`, { method: 'PUT', token: B.json.token, raw: PNG, type: 'image/png' });
  ok(upB.status === 403, 'gewoon lid kan het logo niet wijzigen');
  const bad = await call(`/v1/clubs/${made.club}/logo`, { method: 'PUT', token: A.json.token, raw: Buffer.from('<svg/>'), type: 'image/png' });
  ok(bad.status === 415, 'geen afbeelding → geweigerd (415)');
  const get = await call(`/v1/clubs/${made.club}/logo`, { token: B.json.token });
  ok(get.status === 200 && get.type === 'image/png', 'lid ziet het logo');
  const del = await call(`/v1/clubs/${made.club}/logo`, { method: 'DELETE', token: A.json.token });
  const gone = await call(`/v1/clubs/${made.club}/logo`, { token: B.json.token });
  ok(del.status === 200 && gone.status === 404, 'logo verwijderd');
} catch (e) {
  console.error('✖ ' + e.message);
  process.exitCode = 1;
} finally {
  // Opruimen, ook na een fout: club (cascade: leden, feed, logo) en alle testaccounts.
  if (made.club && made.admin) { const r = await call('/v1/clubs/' + made.club, { method: 'DELETE', token: made.admin }); console.log(`opruimen club: ${r.status}`); }
  for (const t of made.tokens) { const r = await call('/v1/me', { method: 'DELETE', token: t }); console.log(`opruimen account: ${r.status}`); }
  if (made.tokens.length) {
    const after = await call('/v1/me', { token: made.tokens[0] });
    console.log(after.status === 401 || after.status === 404 ? '✔ testaccounts verwijderd' : `✖ testaccount bestaat nog (${after.status})`);
    if (!(after.status === 401 || after.status === 404)) process.exitCode = 1;
  }
}
