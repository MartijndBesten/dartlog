import { test, expect } from '@playwright/test';

// Mijn vrienden in de afgeschermde testomgeving (tools/dev-api.mjs): echte Worker-code, tijdelijke database,
// alleen fictieve spelers en scores. Twee browsercontexten = twee telefoons.
// minors: true alleen in deze testomgeving; in productie staat 'jonger dan 16' dicht (zie de test 'productie-instelling').
const DEV = { api: 'http://127.0.0.1:8799', groups: true, minors: true };
// Eenmalige oprichterscodes van de testserver (tools/dev-api.mjs): één per test en per toestel.
const FOUNDER = (info, test) => `okkie-test-${info.project.name}-${test}-2026`;
const DAY = 86400000;

function seed(name, scores) {
  // scores: [{ daysAgo, perTurn }] → afgeronde scoretrainingen van 30 pijlen (fictief)
  const at = d => new Date(Date.now() - d * DAY).toISOString();
  return {
    version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name, color: '#3ddc84', createdAt: at(30) }],
    trainings: scores.map((s, i) => ({ id: 't' + i, playerId: 'p1', kind: 'score', limitTurns: 10, startedAt: at(s.daysAgo), finishedAt: at(s.daysAgo),
      turns: Array.from({ length: 10 }, () => ({ at: at(s.daysAgo), darts: s.darts })) })),
    matches: [], settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null },
  };
}
async function phone(browser, info, data, dev = DEV) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  await context.addInitScript(([d, dev]) => {
    if (d && !localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d));
    localStorage.setItem('okkie.dev', JSON.stringify(dev));
  }, [data, dev]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  return { context, page, errors };
}
const training = page => page.evaluate(() => localStorage.getItem('oche.data'));
const shareAll = async form => { for (const cb of await form.locator('input[type=checkbox]').all()) await cb.check(); };

test('groep oprichten, vriend uitnodigen, samen vergelijken, link intrekken en verlaten', async ({ browser }, info) => {
  const suffix = info.project.name;
  const A = await phone(browser, info, seed('Martijn', [{ daysAgo: 0, darts: ['S20', 'S20', 'S20'] }, { daysAgo: 8, darts: ['S20', 'S20', 'S5'] }, { daysAgo: 9, darts: ['S20', 'S5', 'S5'] }]));
  const B = await phone(browser, info, seed('Senn', [{ daysAgo: 0, darts: ['T20', 'S20', 'S20'] }, { daysAgo: 1, darts: ['S20', 'S20', 'S20'] }, { daysAgo: 10, darts: ['S5', 'S5', 'S5'] }]));
  const beforeA = await (async () => { await A.page.goto('/'); return training(A.page); })();

  // 1. Oprichter maakt een besloten groep
  await A.page.goto('/vrienden/');
  const reg = A.page.locator('#register');
  await expect(reg).toContainText('Groep oprichten');
  await reg.getByLabel('Je voornaam of bijnaam').fill('Martijn');
  await reg.getByLabel('Oprichterscode').fill(FOUNDER(info, 'groep'));
  await reg.getByText('16 jaar of ouder').click();
  await shareAll(reg);
  await reg.getByLabel('Naam van je groep').fill('Dartvrienden ' + suffix);
  await reg.getByRole('button', { name: 'Maak mijn groep' }).click();
  await expect(A.page.locator('#status')).toContainText('is gemaakt');
  await expect(A.page.locator('.g-head h2')).toHaveText('Dartvrienden ' + suffix);

  // 2. Uitnodigingslink maken (deelbaar via WhatsApp of kopiëren)
  await A.page.getByRole('button', { name: 'Maak uitnodigingslink' }).click();
  const link = await A.page.getByTestId('invite-link').textContent();
  expect(link).toMatch(/\/vrienden\/#uitnodiging=[a-f0-9]{64}$/);
  await expect(A.page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  await expect(A.page.locator('#invites')).toContainText('0/30 gebruikt');

  // 3. Vriend opent de link: ziet alleen naam en aantal, wordt lid na eigen keuze
  await B.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(B.page.locator('#vr')).toContainText('Doe mee met “Dartvrienden ' + suffix + '”');
  await expect(B.page.locator('#vr')).not.toContainText('Martijn');
  expect(B.page.url()).not.toContain('uitnodiging='); // token uit de adresbalk gehaald
  const join = B.page.locator('#register');
  await join.getByLabel('Je voornaam of bijnaam').fill('Senn');
  await join.getByText('16 jaar of ouder').click();
  await join.getByText('Gemiddelde en aantal trainingen').click();
  await join.getByText('30-pijlenchallenge').click();
  await join.getByRole('button', { name: 'Doe mee' }).click();
  await expect(B.page.locator('#status')).toContainText('Welkom bij');

  // 4. Dashboard: deze week, ranglijsten, vergelijken
  await expect(B.page.locator('.highlights')).toContainText('Beste deze week');
  await expect(B.page.locator('.board').first()).toContainText('Senn');
  await expect(B.page.locator('.board').first()).toContainText('Martijn');
  await B.page.getByRole('tab', { name: 'Ranglijsten' }).click();
  await B.page.getByRole('button', { name: 'Algemeen' }).click();
  await expect(B.page.locator('.board')).toContainText('Martijn');
  await B.page.getByRole('button', { name: 'Records' }).click();
  await expect(B.page.locator('.card')).toContainText('Martijn');
  // Senn deelt geen records: staat niet in de recordlijst en niet als 0
  await expect(B.page.locator('ol.board')).not.toContainText('Senn');
  await B.page.getByRole('tab', { name: 'Vergelijken' }).click();
  await expect(B.page.locator('.cmp')).toContainText('Beste 30 pijlen');
  await expect(B.page.locator('.cbar .fill').first()).toBeVisible();
  await B.page.getByRole('tab', { name: 'Leden' }).click();
  await expect(B.page.locator('.members')).toContainText('Martijn');
  await expect(B.page.getByRole('button', { name: 'Maak uitnodigingslink' })).toHaveCount(0); // gewoon lid

  // 5. Eigenaar trekt de link in; een derde telefoon komt er niet meer in
  await A.page.reload();
  await A.page.getByRole('tab', { name: 'Leden' }).click();
  await expect(A.page.locator('.members')).toContainText('Senn');
  await A.page.getByRole('button', { name: 'Intrekken' }).click();
  await expect(A.page.locator('#status')).toContainText('ingetrokken');
  const C = await phone(browser, info, seed('Gast', []));
  await C.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(C.page.locator('#status')).toContainText('niet (meer) geldig');
  await expect(C.page.locator('#vr')).toContainText('Je hebt een uitnodiging nodig');

  // 6. Vriend verlaat de groep
  await B.page.getByRole('tab', { name: 'Mijn deelkeuze' }).click();
  await B.page.getByRole('button', { name: 'Groep verlaten' }).click();
  await expect(B.page.locator('#status')).toContainText('verlaten');
  await A.page.reload();
  await A.page.getByRole('tab', { name: 'Leden' }).click();
  await expect(A.page.locator('.members')).not.toContainText('Senn');

  // Lokale trainingen zijn nergens aangeraakt
  expect(await training(A.page)).toBe(beforeA);
  for (const p of [A, B, C]) expect(p.errors).toEqual([]);
  for (const p of [A, B, C]) await p.context.close();
});

test('jong en oud: kind (12) doet mee na één tik van een ouder, zonder ouderaccount', async ({ browser }, info) => {
  // Opa richt op, kleinkind wordt uitgenodigd, moeder geeft op haar eigen telefoon (zonder OKKIE.) toestemming.
  const A = await phone(browser, info, seed('Opa Jan', [{ daysAgo: 0, darts: ['S20', 'S20', 'S20'] }, { daysAgo: 1, darts: ['S20', 'S20', 'S5'] }, { daysAgo: 2, darts: ['S20', 'S5', 'S5'] }]));
  const K = await phone(browser, info, seed('Daan', [{ daysAgo: 0, darts: ['S20', 'S5', 'S1'] }, { daysAgo: 1, darts: ['S20', 'S20', 'S1'] }, { daysAgo: 2, darts: ['S5', 'S5', 'S5'] }]));
  const M = await phone(browser, info, null);
  const beforeK = await (async () => { await K.page.goto('/'); return training(K.page); })();
  await A.page.goto('/vrienden/');
  const reg = A.page.locator('#register');
  await reg.getByLabel('Oprichterscode').fill(FOUNDER(info, 'kind'));
  await reg.getByText('16 jaar of ouder').click();
  await shareAll(reg);
  await reg.getByLabel('Naam van je groep').fill('Familie ' + info.project.name);
  await reg.getByRole('button', { name: 'Maak mijn groep' }).click();
  await A.page.getByRole('button', { name: 'Maak uitnodigingslink' }).click();
  const link = (await A.page.getByTestId('invite-link').textContent()).replace(/^https?:\/\/[^/]+/, '');

  // Kind meldt zich aan als "jonger dan 16": er wordt nog niets gedeeld, wel een link voor de ouder
  await K.page.goto(link);
  const join = K.page.locator('#register');
  await join.getByLabel('Je voornaam of bijnaam').fill('Daan');
  await join.getByText('Jonger dan 16').click();
  await join.getByText('Gemiddelde en aantal trainingen').click();
  await join.getByText('30-pijlenchallenge').click();
  await join.getByRole('button', { name: 'Doe mee' }).click();
  await expect(K.page.locator('#vr')).toContainText('Vraag even je ouder om “ja”');
  const consent = (await K.page.getByTestId('consent-link').textContent()).replace(/^https?:\/\/[^/]+/, '');
  expect(consent).toMatch(/\/vrienden\/#toestemming=[a-f0-9]{64}$/);
  await K.page.getByRole('button', { name: 'Kijk of ik mee mag doen' }).click();
  await expect(K.page.locator('#vr')).toContainText('Vraag even je ouder'); // nog geen ja

  // Ouder: geen account, ziet precies wat er gedeeld wordt
  await M.page.goto(consent);
  await expect(M.page.locator('#vr')).toContainText('Daan wil meedoen met “Familie ' + info.project.name + '”');
  await expect(M.page.locator('.consent-list')).toContainText('Records (niet gedeeld)');
  await expect(M.page.locator('#vr')).not.toContainText('Opa Jan');
  await M.page.getByRole('button', { name: 'Ik geef toestemming' }).click();
  await expect(M.page.locator('#status')).toContainText('Vink eerst aan');
  await M.page.getByText('Ik ben de ouder of verzorger van Daan').click();
  await M.page.getByRole('button', { name: 'Ik geef toestemming' }).click();
  await expect(M.page.locator('#status')).toContainText('doet nu mee');
  await expect(M.page.locator('#vr')).toContainText('Toestemming voor deze groep intrekken');
  expect(await M.page.evaluate(() => Object.keys(localStorage).filter(k => k !== 'okkie.dev'))).toEqual([]); // ouder hoeft niets op te slaan

  // Kind is nu lid; opa ziet Daan in de groep (zonder records)
  await K.page.getByRole('button', { name: 'Kijk of ik mee mag doen' }).click();
  await expect(K.page.locator('#status')).toContainText('Je ouder heeft ja gezegd voor Familie');
  await A.page.reload();
  await expect(A.page.locator('.board').first()).toContainText('Daan');
  await A.page.locator('.board button.name', { hasText: 'Daan' }).first().click();
  await expect(A.page.locator('.player-card')).toContainText('Deelt met deze groep: gemiddelde en aantal trainingen, 30-pijlenchallenge');
  await A.page.getByRole('button', { name: 'Vergelijk met mij' }).click();
  await expect(A.page.locator('.pick button[aria-pressed="true"]')).toHaveCount(2);

  // Kind wil zelf meer delen (records): dat kan niet zonder ouder; er komt een nieuwe link, de oude toestemming blijft
  await K.page.getByRole('tab', { name: 'Mijn deelkeuze' }).click();
  await K.page.locator('#share').getByText('Records').click();
  await K.page.locator('#share').getByRole('button', { name: 'Opslaan' }).click();
  await expect(K.page.locator('#vr')).toContainText('Meer delen met “Familie');
  const more = (await K.page.getByTestId('consent-link').textContent()).replace(/^https?:\/\/[^/]+/, '');
  expect(more).not.toBe(consent);
  await A.page.reload();
  await A.page.locator('.board button.name', { hasText: 'Daan' }).first().click();
  await expect(A.page.locator('.player-card')).not.toContainText('records');
  await M.page.goto(more);
  await expect(M.page.locator('#vr')).toContainText('Daan wil meer delen met');
  await expect(M.page.locator('.consent-list .badge')).toHaveText('nieuw');
  await M.page.getByText('Ik ben de ouder of verzorger van Daan').click();
  await M.page.getByRole('button', { name: 'Ik geef toestemming' }).click();
  await expect(M.page.locator('#vr')).toContainText('Je hebt toestemming gegeven');
  await A.page.reload();
  await A.page.locator('.board button.name', { hasText: 'Daan' }).first().click();
  await expect(A.page.locator('.player-card')).toContainText('records');
  await M.page.goto(consent); // de eerste link werkt nog om in te trekken

  // Ouder trekt in: Daan verdwijnt online, trainen op zijn eigen telefoon werkt gewoon
  await M.page.getByRole('button', { name: 'Toestemming voor deze groep intrekken' }).click();
  await expect(M.page.locator('#vr')).toContainText('Toestemming ingetrokken');
  await expect(M.page.locator('#vr')).toContainText('in geen enkele groep meer');
  await A.page.reload();
  await expect(A.page.locator('#vr')).not.toContainText('Daan');
  await K.page.goto('/');
  await expect(K.page.locator('.hero h2')).toHaveText('Daan');
  expect(await training(K.page)).toBe(beforeK);
  for (const p of [A, K, M]) expect(p.errors).toEqual([]);
  for (const p of [A, K, M]) await p.context.close();
});

test('productie-instelling: jonger dan 16 zichtbaar maar dicht, 16+ kan zich aanmelden', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const P = await phone(browser, info, seed('Martijn', []), { api: DEV.api, groups: true });
  await P.page.goto('/vrienden/');
  const reg = P.page.locator('#register');
  await expect(reg).toBeVisible();
  await expect(reg.getByTestId('minor-closed')).toContainText('voorlopig voor 16 jaar en ouder');
  await expect(reg.locator('input[name=age][value=minor]')).toBeDisabled();
  await expect(reg.locator('input[name=age][value=adult]')).toBeEnabled();
  expect(P.errors).toEqual([]);
  await P.context.close();
});

test('zonder testinstelling (zoals nu live): "binnenkort", app ongewijzigd, link vanuit de app', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  await page.goto('/');
  await page.fill('#wname', 'Sem');
  await page.click("text=Let's play darts");
  await expect(page.getByRole('link', { name: 'Open Mijn vrienden' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Mijn vrienden' }).click();
  await expect(page.locator('#vr')).toContainText('Binnenkort beschikbaar');
  await page.getByRole('link', { name: 'Verder trainen' }).click();
  await expect(page.locator('.hero h2')).toHaveText('Sem');
});

test('offline: app blijft werken, Mijn vrienden geeft een begrijpelijke melding', async ({ browser }, info) => {
  test.skip(info.project.name !== 'android', 'één keer is genoeg');
  const P = await phone(browser, info, seed('Offline', [{ daysAgo: 0, darts: ['S20', 'S20', 'S20'] }]));
  await P.page.goto('/');
  await P.page.evaluate(() => navigator.serviceWorker.ready);
  await P.page.goto('/vrienden/');
  await expect(P.page.locator('#register')).toBeVisible();
  await P.page.evaluate(() => navigator.serviceWorker.ready);
  await P.context.setOffline(true);
  await P.page.reload();
  const reg = P.page.locator('#register');
  await reg.getByLabel('Oprichterscode').fill(FOUNDER(info, 'offline'));
  await reg.getByText('16 jaar of ouder').click();
  await reg.getByText('Records').click();
  await reg.getByLabel('Naam van je groep').fill('Offline groep');
  await reg.getByRole('button', { name: 'Maak mijn groep' }).click();
  await expect(P.page.locator('#status')).toContainText('offline');
  await P.page.goto('/');
  await expect(P.page.locator('.hero h2')).toHaveText('Offline');
  await P.context.setOffline(false);
  await P.context.close();
});

test('toetsenbord en verminderde beweging in het groepsdashboard', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'één keer is genoeg');
  const { viewport, userAgent } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent, reducedMotion: 'reduce' });
  await context.addInitScript(([d, dev]) => {
    if (d && !localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d));
    localStorage.setItem('okkie.dev', JSON.stringify(dev));
  }, [seed('Toets', [{ daysAgo: 0, darts: ['S20', 'S20', 'S20'] }, { daysAgo: 1, darts: ['S20', 'S20', 'S20'] }, { daysAgo: 2, darts: ['S20', 'S20', 'S20'] }]), DEV]);
  const page = await context.newPage();
  await page.goto('/vrienden/');
  const reg = page.locator('#register');
  await reg.getByLabel('Oprichterscode').fill(FOUNDER(info, 'toets'));
  await reg.getByLabel('16 jaar of ouder').check();
  await reg.getByLabel(/Gemiddelde en aantal trainingen/).check();
  await reg.getByLabel('Naam van je groep').fill('Toetsenbord');
  await reg.getByLabel('Naam van je groep').press('Enter');
  await expect(page.locator('.g-head h2')).toHaveText('Toetsenbord');
  const tab = page.getByRole('tab', { name: 'Ranglijsten' });
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Ranglijsten' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Ranglijsten' })).toBeFocused();
  const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
  expect(running).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});
