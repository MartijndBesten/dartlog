import { test, expect } from '@playwright/test';

// Spelen op een andere telefoon: drie spelers (Bram, Senn, Lotte), twee telefoons, meerdere trainingen op beide,
// ook offline. Echte Worker-code op de testserver (tools/dev-api.mjs), alleen fictieve spelers en scores.
const API = 'http://127.0.0.1:8799';
const HDR = { Origin: 'http://localhost:4173', 'Content-Type': 'application/json' };
const SHARE = { average: true, records: true, challenge: true };
const post = async (path, body, token) => {
  const r = await fetch(API + path, { method: 'POST', headers: { ...HDR, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(path + ': ' + JSON.stringify(j)); return j;
};
const get = async (path, token) => (await fetch(API + path, { headers: { ...HDR, Authorization: 'Bearer ' + token } })).json();

async function phone(browser, info, name, acct) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  const pid = 'p-' + name.toLowerCase();
  await context.addInitScript(([pid, name, acct]) => {
    if (localStorage.getItem('oche.data')) return;
    localStorage.setItem('okkie.dev', JSON.stringify({ api: 'http://127.0.0.1:8799', groups: true }));
    localStorage.setItem('oche.data', JSON.stringify({ version: 2, activePlayerId: pid, players: [{ id: pid, name, color: '#3ddc84', createdAt: '2026-10-01T10:00:00.000Z' }],
      trainings: [], matches: [], settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null } }));
    localStorage.setItem('okkie.community.v1', JSON.stringify({ version: 1, accounts: { [pid]: { ...acct, enabled: true, groupsOnly: true } } }));
  }, [pid, name, { id: acct.account.id, handle: acct.account.handle, nickname: name, token: acct.token, recovery: acct.recovery }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  return { context, page, errors };
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')));
async function throwTurn(page, n) { for (let i = 0; i < 3; i++) { await page.click(`.nums [data-arg="${n}"]`); await page.waitForTimeout(60); } await page.waitForTimeout(500); }

// Eén beurt per speler (3 pijlen), zodat de test snel blijft. extra: namen die als gewone gast meedoen.
async function training(page, { code, extra = [], scores }) {
  await page.click('.tabbar [data-go=train]');
  // De app onthoudt medespelers voor "nog een potje"; elke training begint hier met alleen de eigenaar.
  while (await page.locator('[data-act=tp-remove]').count()) await page.locator('[data-act=tp-remove]').last().click();
  await page.click('[data-act=setup-turns][data-arg="-1"]');
  await page.fill('[data-input=custom-turns]', '1');
  await page.locator('[data-input=custom-turns]').dispatchEvent('change');
  if (code) {
    await page.getByTestId('add-player').click();
    await page.getByTestId('guest-link-open').click();
    await page.locator('[data-form=guest-link] [name=code]').fill(code);
    await page.locator('[data-form=guest-link] [name=name]').fill('Senn');
    await page.locator('[data-form=guest-link] .btn.primary').click();
    await expect(page.locator('#toast')).toContainText('is gekoppeld');
  }
  for (const name of extra) {
    await page.getByTestId('add-player').click();
    const chip = page.locator('.add-known .chip', { hasText: name });
    if (await chip.count()) await chip.click();
    else { await page.fill('[data-form=train-player] input', name); await page.click('[data-form=train-player] .btn'); }
  }
  await page.click('[data-testid=start-score]');
  for (const n of scores) await throwTurn(page, n);
  await expect(page.locator('h1', { hasText: 'Uitslag' })).toBeVisible();
}
async function makeCode(page) {
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-act=guest-pass]');
  const code = await page.getByTestId('guest-code').textContent();
  await page.click('#modal [data-act=modal-close]');
  return code;
}

test('drie spelers, twee telefoons: trainingen bij een vriend komen bij je eigen statistieken, zonder dubbele', async ({ browser }, info) => {
  test.setTimeout(240_000); // twee telefoons, zes trainingen
  // Profielen (fictief): Bram richt een groep op, Senn doet mee. Lotte heeft geen profiel.
  const bram = await post('/v1/register', { nickname: 'Bram', founderCode: `okkie-test-${info.project.name}-extra-2026`, age: 'adult' });
  const { group } = await post('/v1/groups', { name: 'Thuis bij Bram ' + info.project.name, share: SHARE }, bram.token);
  const { invite } = await post(`/v1/groups/${group.id}/invites`, {}, bram.token);
  const senn = await post('/v1/register', { nickname: 'Senn', inviteToken: invite.token, age: 'adult' });
  await post('/v1/invites/accept', { token: invite.token, share: SHARE }, senn.token);

  const S = await phone(browser, info, 'Senn', senn);
  const B = await phone(browser, info, 'Bram', bram);
  await S.page.goto('/'); await B.page.goto('/');

  // Senn traint eerst thuis
  await training(S.page, { scores: [20] });
  // Senn gaat naar Bram: training 1 met Bram, Senn (koppelcode) en Lotte (gewone gast)
  const code1 = await makeCode(S.page);
  expect(code1).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await training(B.page, { code: code1, extra: ['Lotte'], scores: [20, 5, 1] }); // Bram 60, Senn 15, Lotte 3
  await expect(B.page.locator('#toast')).toContainText('doorgestuurd naar Senn');
  // Training 2: zonder nieuwe code speelt Senn alleen lokaal op Brams telefoon
  await training(B.page, { extra: ['Senn', 'Lotte'], scores: [5, 20, 1] });
  // Training 3: nieuwe code, maar Brams telefoon is offline; later alsnog verstuurd
  const code2 = await makeCode(S.page);
  await B.context.setOffline(true);
  await training(B.page, { code: code2, extra: ['Lotte'], scores: [1, 20, 5] }); // Senn 60
  await B.page.click('.tabbar [data-go=more]');
  await expect(B.page.getByTestId('guest-queue')).toContainText('1 resultaat');
  await B.context.setOffline(false); // weer online: de app verstuurt de wachtrij vanzelf
  await expect.poll(() => B.page.evaluate(() => JSON.parse(localStorage.getItem('okkie.guest.v1')).queue.length), { timeout: 10000 }).toBe(0);
  await expect(B.page.getByTestId('guest-queue')).toHaveCount(0);
  // Nogmaals versturen kan geen dubbele opleveren (wachtrij leeg)
  await B.page.reload();
  await expect(B.page.getByTestId('guest-queue')).toHaveCount(0);

  // Bram gooit ook op Senns telefoon mee, met zijn eigen code
  const codeB = await makeCode(B.page);
  await training(S.page, { code: codeB, scores: [5, 20] }); // Senn 15, Bram... (Bram gekoppeld op S)
  // Senn traint daarna nog een keer alleen
  await training(S.page, { scores: [5] });

  // Thuis: Senns telefoon haalt de twee trainingen van Brams telefoon op
  await S.page.reload();
  await expect(S.page.locator('#toast')).toContainText('2 resultaten van andere telefoons zijn toegevoegd');
  await S.page.reload(); // nog eens openen: niets dubbel
  const sd = await stored(S.page);
  const sennOwn = sd.trainings.filter(t => t.playerId === 'p-senn');
  expect(sennOwn.filter(t => t.source === 'Andere telefoon').map(t => t.summary.points).sort((a, b) => a - b)).toEqual([15, 60]);
  expect(sennOwn.length).toBe(5); // 3 thuis + 2 bij Bram (de lokale training 2 telt niet: geen code)
  expect(new Set(sennOwn.map(t => t.id)).size).toBe(sennOwn.length);
  // Senns statistieken in de app tellen ze mee
  await S.page.click('.tabbar [data-go=stats]');
  await expect(S.page.locator('main')).toContainText('5');

  // Brams telefoon: Bram haalt zijn training van Senns telefoon op; zijn eigen scores blijven van hem
  await B.page.reload();
  await expect(B.page.locator('#toast')).toContainText('resultaat van een andere telefoon is toegevoegd');
  const bd = await stored(B.page);
  const bramOwn = bd.trainings.filter(t => t.playerId === 'p-bram');
  expect(bramOwn.length).toBe(4);
  expect(bramOwn.filter(t => t.source === 'Andere telefoon').length).toBe(1);
  // Lotte blijft een gewone lokale speler op Brams telefoon; Senn als gast staat daar ook lokaal (zonder profiel)
  expect(bd.players.map(p => p.name).sort()).toEqual(['Bram', 'Lotte', 'Senn']);
  expect(bd.trainings.filter(t => bd.players.find(p => p.id === t.playerId)?.name === 'Lotte').length).toBe(3);

  // Online: de gedeelde cijfers van Senn bevatten alle 5 trainingen, inbox is leeg
  await expect.poll(async () => (await get(`/v1/groups/${group.id}`, bram.token)).members.find(m => m.nickname === 'Senn')?.average?.all?.sessions, { timeout: 8000 }).toBe(5);
  expect((await get('/v1/me/inbox', senn.token)).trainings).toEqual([]);
  // Een naam alleen is niet genoeg: op Senns telefoon kan "Senn" niet als nieuwe gast worden toegevoegd
  await S.page.click('.tabbar [data-go=train]');
  await S.page.click('[data-testid=add-player]');
  await S.page.fill('[data-form=train-player] input', 'senn');
  await S.page.click('[data-form=train-player] .btn');
  await expect(S.page.locator('[data-testid=train-players] li')).toHaveCount(1);
  for (const p of [S, B]) expect(p.errors).toEqual([]);
  for (const p of [S, B]) await p.context.close();
});

// ---------- Koppelcode bij een 301/501-wedstrijd ----------
async function dart(page, c) {
  const m = c.match(/^([SDT]?)(\d+)$/);
  if (m[1] === 'D' || m[1] === 'T') await page.click(`[data-act=mod][data-arg="${m[1] === 'T' ? 3 : 2}"]`);
  await page.click(`.nums [data-arg="${m[2]}"]`); await page.waitForTimeout(60);
}
async function linkOpponent(page, code, name) {
  await page.getByTestId('add-player').click();
  await page.getByTestId('guest-link-open').click();
  await page.locator('[data-form=guest-link] [name=code]').fill(code);
  await page.locator('[data-form=guest-link] [name=name]').fill(name);
  await page.locator('[data-form=guest-link] .btn.primary').click();
  await expect(page.locator('#toast')).toContainText('is gekoppeld');
}

test('501 op één telefoon: de gekoppelde tegenstander krijgt zijn eigen uitslag, als wedstrijd, zonder dubbele; ook offline', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één toestelformaat is genoeg');
  test.setTimeout(180_000);
  const senn = await post('/v1/darters/join', { nickname: 'SennW', age: 'adult' });
  const bram = await post('/v1/darters/join', { nickname: 'BramW', age: 'adult' });
  const S = await phone(browser, info, 'Senn', senn);
  const B = await phone(browser, info, 'Bram', bram);
  await S.page.goto('/'); await B.page.goto('/');
  const before = await stored(S.page);

  // Bram start 501 (1 leg) op zijn telefoon en koppelt Senn met Senns code
  const code = await makeCode(S.page);
  await B.page.click('.tabbar [data-go=match]');
  await B.page.click('[data-act=match-set][data-arg="bestOf:1"]');
  await linkOpponent(B.page, code, 'Senn');
  await B.page.click('[data-testid=start-match]');
  // Bram 3×3, Senn 180, 180, en 141 uit (T20 T19 D12)
  for (const turn of [['S1', 'S1', 'S1'], ['T20', 'T20', 'T20'], ['S1', 'S1', 'S1'], ['T20', 'T20', 'T20'], ['S1', 'S1', 'S1'], ['T20', 'T19', 'D12']]) for (const c of turn) await dart(B.page, c);
  await expect(B.page.getByTestId('sent-to')).toContainText('Senn');
  await expect(B.page.locator('#toast')).toContainText('doorgestuurd naar Senn');
  const bd = await stored(B.page);
  expect(bd.matches).toHaveLength(1);
  expect(bd.matches[0].legs[0].turns).toHaveLength(6);   // Brams telefoon bewaart de wedstrijd gewoon

  // Senns telefoon: wedstrijd bij zijn wedstrijden, niet bij trainingen; nog eens openen geeft geen dubbele
  await S.page.reload();
  await expect(S.page.locator('#toast')).toContainText('resultaat van een andere telefoon is toegevoegd');
  await S.page.reload();
  let sd = await stored(S.page);
  expect(sd.trainings.length).toBe(before.trainings.length);
  expect(sd.matches).toHaveLength(1);
  const m = sd.matches[0];
  expect(m.source).toBe('Andere telefoon');
  expect(m.players[m.summary.me]).toEqual({ id: 'p-senn', name: 'Senn' });
  expect([m.summary.winner, m.summary.darts, m.summary.points, m.summary.high, m.summary.bestCheckout, m.summary.t180]).toEqual([1, 9, 501, 180, 141, 2]);
  await S.page.click('.tabbar [data-go=more]'); await S.page.click('[data-go=history]');
  await expect(S.page.locator('.history')).toContainText('Gewonnen');
  await expect(S.page.locator('.history')).toContainText('gespeeld op andere telefoon');
  await S.page.click('.tabbar [data-go=stats]');
  await expect(S.page.locator('.records')).toContainText('141');   // hoogste finish als record

  // Offline: nieuwe code, Brams telefoon zonder internet, wedstrijd na twee beurten gestopt (geen winnaar)
  const code2 = await makeCode(S.page);
  await B.context.setOffline(true);
  await B.page.click('.tabbar [data-go=match]');
  while (await B.page.locator('[data-act=mp-remove]').count() > 0) await B.page.locator('[data-act=mp-remove]').last().click();
  await linkOpponent(B.page, code2, 'Senn');
  await B.page.click('[data-testid=start-match]');
  for (const c of ['T20', 'S5', 'S1', 'S20', 'S20', 'S20']) await dart(B.page, c);
  await B.page.click('[data-act=stop-match]'); await B.page.click('[data-act=modal-ok]');
  await B.page.click('.tabbar [data-go=more]');
  await expect(B.page.getByTestId('guest-queue')).toContainText('1 resultaat');
  await B.context.setOffline(false);
  await expect.poll(() => B.page.evaluate(() => JSON.parse(localStorage.getItem('okkie.guest.v1')).queue.length), { timeout: 10000 }).toBe(0);
  await S.page.reload(); await S.page.waitForTimeout(800); await S.page.reload();
  sd = await stored(S.page);
  expect(sd.matches).toHaveLength(2);
  const stopped = sd.matches.find(x => x.stopped);
  expect([stopped.summary.winner, stopped.summary.points, stopped.summary.darts]).toEqual([null, 60, 3]);
  expect((await get('/v1/me/inbox', senn.token)).matches).toEqual([]);
  for (const p of [S, B]) expect(p.errors).toEqual([]);
  for (const p of [S, B]) await p.context.close();
});
