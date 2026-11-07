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
  await expect(P.locator('#sheet')).toContainText('je training en scores tellen direct mee voor de club');
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
  // Browser zonder speler: eerst de waarschuwing voor wie OKKIE. al als app heeft (geen tweede profiel).
  await expect(C.page.getByTestId('app-note')).toContainText('De browser en de app delen geen spelers of trainingen');
  await expect(C.page.getByTestId('app-note')).toContainText(code);
  // Automatisch meetellen: standaard UIT, een aparte keuze naast de verplichte toestemming.
  await expect(C.page.locator('#joinflow input[name=auto]')).not.toBeChecked();
  await C.page.locator('#joinflow input[name=auto]').check();
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
  // In de club: automatisch meetellen staat aan (zelf gekozen) en is uit te zetten.
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

test('zonder automatisch meetellen gaat er na een training niets naar de club; ook niet later bij goedkeuring', async ({ browser }, info) => {
  const club = 'Stil ' + info.project.name;
  const A = await phone(browser, info, seed('Anja'));
  const B = await phone(browser, info, seed('Bas'));
  await A.page.goto('/club/');
  await A.page.locator('#create input[name=name]').fill(club);
  await A.page.locator('#create input[name=consent]').check();
  await A.page.locator('#create button').click();
  const code = (await A.page.getByTestId('invite-board').locator('.club-code').first().textContent()).trim();
  await A.page.locator('#challenge select').selectOption('score30');
  await A.page.locator('#challenge').getByRole('button', { name: 'Opslaan' }).click();
  await expect(A.page.locator('#status')).toContainText('Weekoefening opgeslagen');
  // Bas heeft al een speler in deze browser: die staat gekozen, de app-waarschuwing staat onderaan, geen tweede speler.
  await B.page.goto('/club/#club=' + code);
  await expect(B.page.locator('#joinflow input[name=who][value=p1]')).toBeChecked();
  await expect(B.page.getByTestId('app-note')).toBeVisible();
  await B.page.locator('#joinflow input[name=consent]').check();
  await B.page.locator('#joinflow button.primary').click();
  await expect(B.page.getByTestId('join-done')).toContainText('aanmelding staat klaar');
  // Training gooien terwijl hij wacht, daarna toelaten: er mag niets automatisch mee.
  await B.page.getByTestId('start-training').click();
  for (let i = 0; i < 30; i++) await key(B.page, 20);
  await expect(B.page.getByTestId('compare').or(B.page.getByTestId('best-turn'))).toBeVisible();
  await A.page.getByRole('tab', { name: /Beheer/ }).click();
  await A.page.getByRole('button', { name: 'Toelaten' }).click();
  await expect(A.page.locator('#status')).toContainText('Lid toegelaten');
  await B.page.goto('/');   // app start: synchroniseert wat klaarstaat
  await B.page.goto('/club/');
  await B.page.getByRole('button', { name: 'Openen' }).click();
  await expect(B.page.locator('#auto')).not.toBeChecked();
  await expect(B.page.locator('#panel .board')).toHaveCount(0);
  await A.page.getByRole('tab', { name: 'Feed' }).click();
  await expect(A.page.locator('#panel')).not.toContainText('Bas');
  const players = await B.page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')).players.map(p => p.name));
  expect(players).toEqual(['Bas']);
  for (const x of [A, B]) expect(x.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});

test('iPhone-app (nagebootst): code invullen in de app, geen browserwaarschuwing, bestaande speler, poster opent buiten de app', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'app-laag: één toestelformaat is genoeg');
  const club = 'App ' + info.project.name;
  const A = await phone(browser, info, seed('Anja'));
  await A.page.goto('/club/');
  await A.page.locator('#create input[name=name]').fill(club);
  await A.page.locator('#create input[name=consent]').check();
  await A.page.locator('#create button').click();
  const code = (await A.page.getByTestId('invite-board').locator('.club-code').first().textContent()).trim();
  const N = await phone(browser, info, seed('Nina'));
  await N.context.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { App: { addListener: () => Promise.resolve({ remove() {} }) } } };
  });
  await N.page.goto('/club/');
  await N.page.locator('#code input[name=code]').fill(code.toLowerCase());
  await N.page.locator('#code button').click();
  await expect(N.page.getByTestId('join-hero')).toContainText(club);
  await expect(N.page.getByTestId('app-note')).toHaveCount(0);
  await expect(N.page.locator('#joinflow input[name=who][value=p1]')).toBeChecked();
  await N.page.locator('#joinflow input[name=consent]').check();
  await N.page.locator('#joinflow button.primary').click();
  await expect(N.page.getByTestId('join-done')).toBeVisible();
  expect(await N.page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')).players.length)).toBe(1);
  // Beheer in de app: de posterlink gaat naar app.okkiedarts.nl (opent in Safari, daar kun je printen).
  const href = await (async () => {
    const P = await N.context.newPage();
    await P.goto('/club/');
    return P.evaluate(async () => (await import('/js/native.js')).publicUrl('club/poster.html'));
  })();
  expect(href).toBe('https://app.okkiedarts.nl/club/poster.html');
  for (const x of [A, N]) expect(x.errors).toEqual([]);
  await A.context.close(); await N.context.close();
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
