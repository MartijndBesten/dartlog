import { test, expect } from '@playwright/test';

// OKKIE. Club bij het bord (kantine/clubhuis): club aanmaken → QR-code (poster) → nieuwe speler scant zonder OKKIE. →
// profiel aanmaken → meedoen → scoretraining → telt automatisch mee. Daarna: code vernieuwen = oude QR werkt niet meer,
// en een persoonlijke uitnodiging die één keer werkt. Afgeschermde test-API (tools/dev-api.mjs), alleen fictieve spelers.
const DEV = { api: 'http://127.0.0.1:8799', club: true };
const TAP_GAP = 60;   // de app negeert dezelfde toets twee keer binnen 35 ms
const key = async (page, n) => { await page.locator(`.nums [data-act=key][data-arg="${n}"]`).first().click(); await page.waitForTimeout(TAP_GAP); };

function seed(name) {
  const now = new Date().toISOString();
  return { version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name, color: '#3ddc84', createdAt: now }], trainings: [], matches: [],
    settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null } };
}
async function phone(browser, info, data) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  await context.addInitScript(([d, dev]) => {
    if (d && !localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d));
    localStorage.setItem('okkie.dev', JSON.stringify(dev));
  }, [data, DEV]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  return { context, page, errors };
}
const inviteCode = href => new URL(href).hash.match(/club=([A-Z0-9]+)/)[1];

test('kantine: club aanmaken, poster, scannen zonder profiel, meedoen, score telt automatisch mee, oude QR ongeldig na vernieuwen', async ({ browser }, info) => {
  const club = 'De Roos ' + info.project.name;
  const A = await phone(browser, info, seed('Anja'));
  const C = await phone(browser, info, null);   // nieuwe speler: nog nooit OKKIE. gebruikt

  // 1. Club aanmaken; beheer opent met de QR-code bij het bord bovenaan.
  await A.page.goto('/club/');
  await A.page.locator('#create input[name=name]').fill(club);
  await A.page.locator('#create input[name=consent]').check();
  await A.page.locator('#create').getByRole('button', { name: 'Club oprichten' }).click();
  await expect(A.page.locator('#status')).toContainText('hang hem bij het bord');
  const board = A.page.getByTestId('invite-board');
  await expect(board.locator('.club-qr svg')).toBeVisible();
  const code = (await board.locator('.club-code').first().textContent()).trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  await expect(A.page.getByTestId('invite-personal')).toBeVisible();
  // Weekoefening en "direct toelaten" voor het bord in de kantine.
  await A.page.locator('#challenge select').selectOption('score30');
  await A.page.locator('#challenge').getByRole('button', { name: 'Opslaan' }).click();
  await expect(A.page.locator('#status')).toContainText('Weekoefening opgeslagen');
  await A.page.locator(`input[data-direct="${code}"]`).check();
  await expect(A.page.locator('#status')).toContainText('direct mee');
  await expect(A.page.locator(`input[data-direct="${code}"]`)).toBeChecked();

  // 2. Printweergave: clubnaam, QR-code, korte code en uitleg; A4 en A5.
  const posterHref = await A.page.getByTestId('poster-link').first().getAttribute('href');
  expect(posterHref).toMatch(/\/club\/poster\.html#code=/);
  const P = await A.context.newPage();
  await P.goto(posterHref);
  await expect(P.getByTestId('poster-club')).toHaveText(club);
  await expect(P.getByTestId('poster-qr').locator('svg')).toBeVisible();
  await expect(P.getByTestId('poster-code')).toHaveText(code.slice(0, 4) + ' ' + code.slice(4));
  await expect(P.locator('#sheet')).toContainText(`Scan deze code en speel mee voor ${club}`);
  await expect(P.locator('#sheet')).toContainText('Je training en scores tellen direct mee voor de club');
  await expect(P.locator('#sheet')).toContainText('Nog geen OKKIE.? Scan en doe mee');
  const pageSize = () => P.locator('#page-size').evaluate(el => el.textContent);
  expect(await pageSize()).toMatch(/size: A4/);
  await P.getByLabel(/A5/).check();
  await expect.poll(pageSize).toMatch(/size: A5/);
  await expect(P.locator('#sheet')).toHaveClass(/a5/);
  await P.emulateMedia({ media: 'print' });
  await expect(P.getByTestId('poster-controls')).toBeHidden();
  const box = await P.locator('#sheet').boundingBox();
  expect(Math.round(box.width / box.height * 100) / 100).toBeCloseTo(148 / 210, 1);
  await P.close();

  // 3. Nieuwe speler scant de QR-code: club meteen herkend, naam invullen, meedoen (direct lid).
  await C.page.goto('/club/#club=' + code);
  await expect(C.page.getByTestId('join-hero')).toContainText(club);
  await expect(C.page.getByTestId('join-hero')).not.toContainText('eerst toe');
  await C.page.locator('#joinflow input[name=name]').fill('Cor');
  await expect(C.page.locator('#joinflow input[name=auto]')).toBeChecked();
  await C.page.locator('#joinflow input[name=consent]').check();
  await C.page.locator('#joinflow').getByRole('button', { name: `Meedoen met ${club}` }).click();
  await expect(C.page.getByTestId('join-done')).toContainText(`Je doet mee met ${club}!`);
  const local = await C.page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')));
  expect(local.players.map(p => p.name)).toEqual(['Cor']);
  expect(local.activePlayerId).toBe(local.players[0].id);

  // 4. Meteen gooien: de knop start de weekoefening (30 pijlen) voor Cor; na afloop telt hij automatisch mee.
  const start = C.page.getByTestId('start-training');
  await expect(start).toHaveText('Gooi de weekoefening: Scoretraining 30 pijlen');
  await start.click();
  await expect(C.page.locator('.nums')).toBeVisible();
  for (let i = 0; i < 30; i++) await key(C.page, 20);
  await expect(C.page.locator('#toast')).toContainText(`Telt mee voor ${club}`);
  await A.page.getByRole('tab', { name: 'Weekoefening' }).click();
  await expect(A.page.locator('#panel .board').first()).toContainText('Cor');
  await A.page.getByRole('tab', { name: 'Feed' }).click();
  await expect(A.page.locator('#panel')).toContainText('Cor');
  // In de club: automatisch meetellen staat aan en is uit te zetten.
  await C.page.goto('/club/');
  await C.page.getByRole('button', { name: 'Openen' }).click();
  await expect(C.page.locator('#auto')).toBeChecked();
  await C.page.locator('#auto').uncheck();
  await expect(C.page.locator('#status')).toContainText('staat uit');

  // 5. Nieuwe code: de oude QR-code (en poster) werkt direct niet meer, de nieuwe wel.
  await A.page.getByRole('tab', { name: /Beheer/ }).click();
  await A.page.locator(`[data-renew="${code}"]`).click();
  await expect(A.page.locator('#status')).toContainText('De oude werkt niet meer');
  const mainCode = () => A.page.getByTestId('invite-board').locator('.club-code').first().textContent().then(t => t.trim());
  await expect.poll(mainCode).not.toBe(code);
  const fresh = await mainCode();
  await expect(A.page.locator(`input[data-direct="${fresh}"]`)).toBeChecked();   // instelling blijft
  const D = await phone(browser, info, seed('Dirk'));
  await D.page.goto('/club/#club=' + code);
  await expect(D.page.getByTestId('bad-code')).toContainText('werkt niet (meer)');
  await D.page.goto('/club/#club=' + fresh);
  await expect(D.page.getByTestId('join-hero')).toContainText(club);

  for (const x of [A, C, D]) expect(x.errors).toEqual([]);
  await A.context.close(); await C.context.close(); await D.context.close();
});

test('persoonlijke uitnodiging: werkt één keer, speler is direct lid zonder goedkeuring; intrekken', async ({ browser }, info) => {
  const club = 'Kantine ' + info.project.name;
  const A = await phone(browser, info, seed('Anja'));
  const B = await phone(browser, info, seed('Bas'));
  const E = await phone(browser, info, seed('Eva'));
  await A.page.goto('/club/');
  await A.page.locator('#create input[name=name]').fill(club);
  await A.page.locator('#create input[name=consent]').check();
  await A.page.locator('#create button').click();
  await expect(A.page.getByTestId('invite-personal')).toBeVisible();
  // De bordcode staat standaard op goedkeuren; de persoonlijke uitnodiging laat toch direct toe.
  await A.page.locator('#newinvite input[name=label]').fill('Bas');
  await A.page.locator('#newinvite').getByRole('button', { name: 'Uitnodiging maken' }).click();
  await expect(A.page.getByTestId('invite-new')).toContainText('Uitnodiging voor Bas');
  const link = await A.page.getByTestId('invite-new').locator('[data-sharelink]').getAttribute('data-sharelink');
  const code = inviteCode(link);
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
  await B.page.goto('/club/#club=' + code);
  await expect(B.page.getByTestId('join-hero')).toContainText('Je bent uitgenodigd voor');
  await B.page.locator('#joinflow input[name=consent]').check();
  await B.page.locator('#joinflow button[class*=primary]').click();
  await expect(B.page.getByTestId('join-done')).toContainText(`Je doet mee met ${club}!`);
  // Tweede keer: werkt niet meer.
  await E.page.goto('/club/#club=' + code);
  await expect(E.page.getByTestId('bad-code')).toBeVisible();
  // Intrekken van een nog ongebruikte uitnodiging.
  await A.page.reload();
  await A.page.getByRole('button', { name: 'Openen' }).click();
  await A.page.getByRole('tab', { name: /Beheer/ }).click();
  await A.page.locator('#newinvite').getByRole('button', { name: 'Uitnodiging maken' }).click();
  const second = inviteCode(await A.page.getByTestId('invite-new').locator('[data-sharelink]').getAttribute('data-sharelink'));
  await A.page.locator(`[data-delcode="${second}"]`).click();
  await expect(A.page.locator('#status')).toContainText('ongeldig gemaakt');
  await E.page.goto('/club/#club=' + second);
  await expect(E.page.getByTestId('bad-code')).toBeVisible();
  for (const x of [A, B, E]) expect(x.errors).toEqual([]);
  await A.context.close(); await B.context.close(); await E.context.close();
});
