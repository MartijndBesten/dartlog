import { test, expect } from '@playwright/test';

// Darters op de app-origin zonder bereikbare API (lokaal zonder testinstelling): veilig, app onaangeroerd.
test('Darters laadt veilig zonder API en raakt de app niet', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.fill('#wname', 'Senn');
  await page.click("text=Let's play darts");
  await page.goto('/community/');
  await expect(page).toHaveTitle(/Darters/);
  await expect(page.locator('#rankings')).toContainText('niet bereikbaar');
  await expect(page.locator('#account')).toContainText('Darters is niet bereikbaar');
  // Geen enkel netwerkverzoek naar een API en geen fouten
  expect(errors).toEqual([]);
  // De app zelf werkt nog gewoon en kent de speler nog
  await page.goto('/');
  await expect(page.locator('.hero h2')).toHaveText('Senn');
  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored).toContain('oche.data');
  expect(stored).not.toContain('okkie.community.v1');
});

test('introductiepagina laadt en linkt naar de app', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  await page.goto('/ontdek/');
  await expect(page).toHaveTitle(/OKKIE/);
  await expect(page.locator('a.nav-cta')).toHaveAttribute('href', '../');
  const horiz = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(horiz).toBeLessThanOrEqual(0);
});

// Darters met de echte Worker-code op een tijdelijke database (tools/dev-api.mjs). Fictieve spelers.
const DEV = { api: 'http://127.0.0.1:8799' };
async function phone(browser, info, players, trainings = []) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' });
  await context.addInitScript(([dev, players, trainings]) => {
    localStorage.setItem('okkie.dev', JSON.stringify(dev));
    if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify({ version: 2, activePlayerId: players[0].id, players, trainings, matches: [],
      settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null } }));
  }, [DEV, players, trainings]);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  return { context, page, errors };
}
const tr = (id, playerId, perTurn) => ({ id, playerId, kind: 'score', limitTurns: 10, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
  turns: Array.from({ length: 10 }, () => ({ at: new Date().toISOString(), darts: perTurn })) });

test('Darters: kijken zonder account, delen aan en uit, twee spelers op één telefoon gescheiden, kind pas na ja van ouder', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const sfx = Math.random().toString(36).slice(2, 6);
  const A = await phone(browser, info, [{ id: 'pa', name: 'Bram' + sfx, color: '#3ddc84' }, { id: 'pb', name: 'Noor' + sfx, color: '#ff5a5f' }],
    [tr('t1', 'pa', ['T20', 'S20', 'S20']), tr('t2', 'pb', ['S5', 'S5', 'S5'])]);
  await A.page.goto('/community/');
  const before = await A.page.evaluate(() => localStorage.getItem('oche.data'));
  // Kijken kan zonder account; standaard deelt niemand
  await expect(A.page.locator('[data-toggle=pa]')).not.toBeChecked();
  await expect(A.page.locator('#rankings')).not.toContainText('Bram' + sfx);
  // Bram (16+) zet delen aan
  await A.page.locator('[data-toggle=pa]').check();
  const form = A.page.locator('[data-join=pa]');
  await form.getByText('16 jaar of ouder').click();
  await form.getByRole('button', { name: 'Delen aanzetten' }).click();
  await expect(A.page.locator('#account')).toContainText('Delen staat aan');
  await expect(A.page.locator('#rankings')).toContainText('Bram' + sfx);
  await expect(A.page.locator('#rankings')).toContainText('100,00');      // 100 per beurt
  await expect(A.page.locator('#rankings')).toContainText('badges');      // 1.7.3: badges en dagen op rij uit het totaal
  await expect(A.page.locator('#rankings')).not.toContainText('Noor' + sfx); // andere speler op dezelfde telefoon deelt niet
  // Noor (jonger dan 16): eerst een ouder
  await A.page.locator('[data-toggle=pb]').check();
  const fb = A.page.locator('[data-join=pb]');
  await fb.getByText('Jonger dan 16').click();
  await fb.getByRole('button', { name: 'Delen aanzetten' }).click();
  await expect(A.page.locator('#account')).toContainText('Wacht op toestemming');
  await A.page.locator('[data-action=copy-parent][data-player=pb]').click();
  const link = await A.page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/#ouder=[a-f0-9]{64}$/);
  await A.page.reload();
  await expect(A.page.locator('#rankings')).not.toContainText('Noor' + sfx);
  // Ouder op eigen telefoon, zonder OKKIE.
  const M = await phone(browser, info, [{ id: 'pm', name: 'Moeder', color: '#4da3ff' }]);
  await M.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(M.page.getByTestId('parent-view')).toContainText('Toestemming voor Noor' + sfx);
  await M.page.getByText('Ik ben de ouder of verzorger').click();
  await M.page.getByRole('button', { name: 'Ik geef toestemming' }).click();
  await expect(M.page.getByTestId('parent-view')).toContainText('Je hebt toestemming gegeven');
  await A.page.reload();
  await expect(A.page.locator('#rankings')).toContainText('Noor' + sfx);
  await expect(A.page.locator('#rankings')).toContainText('15,00');
  // Bram zet delen uit: meteen weg; lokale trainingen blijven
  await A.page.locator('[data-toggle=pa]').uncheck();
  await expect(A.page.locator('#account')).toContainText('Delen staat uit');
  await expect(A.page.locator('#rankings')).not.toContainText('Bram' + sfx);
  expect(await A.page.evaluate(() => localStorage.getItem('oche.data'))).toBe(before);
  // Ouder trekt in: Noor verdwijnt ook
  await M.page.reload();
  await M.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await M.page.getByRole('button', { name: /Toestemming intrekken/ }).click();
  await expect(M.page.locator('#parent')).toContainText('Toestemming ingetrokken');
  await A.page.reload();
  await expect(A.page.locator('#rankings')).not.toContainText('Noor' + sfx);
  for (const p of [A, M]) expect(p.errors).toEqual([]);
  for (const p of [A, M]) await p.context.close();
});

test('Darters: een naam die online is aangepast, neemt de app over bij openen (Opslaan zet de oude naam niet terug)', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const sfx = Math.random().toString(36).slice(2, 6);
  const A = await phone(browser, info, [{ id: 'pa', name: 'Lynn' + sfx, color: '#3ddc84' }], [tr('t1', 'pa', ['S20', 'S20', 'S20'])]);
  await A.page.goto('/community/');
  await A.page.locator('[data-toggle=pa]').check();
  const form = A.page.locator('[data-join=pa]');
  await form.locator('input[name=nickname]').fill('Lynn' + sfx + ' Achternaam');
  await form.getByText('16 jaar of ouder').click();
  await form.getByRole('button', { name: 'Delen aanzetten' }).click();
  await expect(A.page.locator('#account')).toContainText('Zichtbaar als Lynn' + sfx + ' Achternaam');
  // De beheerder zet de naam online op alleen de voornaam (zoals bij het opschonen in 1.6.3).
  const token = await A.page.evaluate(() => JSON.parse(localStorage.getItem('okkie.community.v1')).accounts.pa.token);
  const r = await A.page.request.fetch(DEV.api + '/v1/me', { method: 'PATCH', data: { nickname: 'Lynn' + sfx },
    headers: { Authorization: 'Bearer ' + token, Origin: 'http://localhost:4173', 'Content-Type': 'application/json' } });
  expect(r.status()).toBe(200);
  await A.page.reload();
  await expect(A.page.locator('#account .status b')).toHaveText('Lynn' + sfx);
  await expect(A.page.locator('[data-rename=pa] input[name=nickname]')).toHaveValue('Lynn' + sfx);
  expect(await A.page.evaluate(() => JSON.parse(localStorage.getItem('okkie.community.v1')).accounts.pa.nickname)).toBe('Lynn' + sfx);
  await expect(A.page.locator('#rankings')).toContainText('Lynn' + sfx);
  await expect(A.page.locator('#rankings')).not.toContainText('Achternaam');
  expect(A.errors).toEqual([]);
  await A.context.close();
});

test('Darters: een darter melden of verbergen op dit toestel (App Store-richtlijn 1.2), en weer tonen', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const sfx = Math.random().toString(36).slice(2, 6);
  const A = await phone(browser, info, [{ id: 'pa', name: 'Kees' + sfx, color: '#3ddc84' }], [tr('t1', 'pa', ['T20', 'S20', 'S20'])]);
  await A.page.goto('/community/');
  await A.page.locator('[data-toggle=pa]').check();
  await A.page.locator('[data-join=pa]').getByText('16 jaar of ouder').click();
  await A.page.locator('[data-join=pa]').getByRole('button', { name: 'Delen aanzetten' }).click();
  await expect(A.page.locator('#rankings')).toContainText('Kees' + sfx);
  // Iemand anders kijkt mee op zijn eigen telefoon
  const B = await phone(browser, info, [{ id: 'pz', name: 'Lotte', color: '#4da3ff' }]);
  await B.page.goto('/community/');
  await B.page.locator('.d-name', { hasText: 'Kees' + sfx }).click();
  const report = B.page.getByTestId('report-darter');
  await expect(report).toHaveAttribute('href', /^mailto:info@denckh\.nl\?subject=Melding%20OKKIE\.%20Darters%3A%20[a-z0-9]{12}&body=/);
  expect(decodeURIComponent(await report.getAttribute('href'))).toContain('Naam: Kees' + sfx);
  await B.page.getByTestId('hide-darter').click();
  await expect(B.page.locator('#rankings')).not.toContainText('Kees' + sfx);
  await expect(B.page.locator('#rankings')).toContainText('verborgen op dit toestel');
  await B.page.reload();
  await expect(B.page.locator('#rankings')).not.toContainText('Kees' + sfx);   // blijft verborgen
  await B.page.getByRole('button', { name: 'Weer tonen' }).click();
  await expect(B.page.locator('#rankings')).toContainText('Kees' + sfx);
  // Voor de schrijver zelf verandert er niets
  await A.page.reload();
  await expect(A.page.locator('#rankings')).toContainText('Kees' + sfx);
  await A.page.locator('[data-toggle=pa]').uncheck();
  for (const p of [A, B]) expect(p.errors).toEqual([]);
  for (const p of [A, B]) await p.context.close();
});
