import { test, expect } from '@playwright/test';

// OKKIE. Club in de afgeschermde testomgeving (tools/dev-api.mjs): echte Worker-code, tijdelijke database, alleen
// fictieve spelers. Twee browsercontexten zijn twee telefoons. In productie staat Club uit (CLUB_OPEN / CLUBS_ENABLED).
const DEV = { api: 'http://127.0.0.1:8799', club: true };
const PILOT = (info, t) => `okkie-proefclub-${info.project.name}-${t}-2026`;

function seed(name) {
  const now = new Date().toISOString();
  return { version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name, color: '#3ddc84', createdAt: now }],
    trainings: [{ id: 't1', playerId: 'p1', kind: 'score', limitTurns: 10, startedAt: now, finishedAt: now,
      turns: Array.from({ length: 10 }, () => ({ at: now, darts: ['T20', 'S20', 'S20'] })) }],
    matches: [], settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null } };
}
async function phone(browser, info, data, dev = DEV) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  await context.addInitScript(([d, dev]) => {
    if (d && !localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d));
    if (dev) localStorage.setItem('okkie.dev', JSON.stringify(dev));
  }, [data, dev]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  return { context, page, errors };
}

test('standaard uit: zonder vlag geen Club in de app en de clubpagina zegt dat het nog niet beschikbaar is', async ({ browser }, info) => {
  const P = await phone(browser, info, seed('Sem'), null);
  await P.page.goto('/');
  await P.page.click('#tabbar [data-go=more]');
  await expect(P.page.getByTestId('invite-card')).toBeVisible();
  await expect(P.page.getByTestId('club-link')).toHaveCount(0);
  await P.page.goto('/club/');
  await expect(P.page.locator('#vr')).toContainText('nog niet beschikbaar');
  expect(P.errors).toEqual([]);
  await P.context.close();
});

test('club oprichten met proefclubcode, lid via QR-link, goedkeuren, weekoefening, feed, verbergen/melden en verlaten', async ({ browser }, info) => {
  const A = await phone(browser, info, seed('Anja'));
  const B = await phone(browser, info, seed('Bas'));

  // 1. Beheerder richt een proefclub op.
  await A.page.goto('/club/');
  await A.page.getByText('Een club oprichten (proefclub)').click();
  const create = A.page.locator('#create');
  await create.getByLabel('Naam van de club').fill('DC De Pijl ' + info.project.name);
  await create.getByLabel('Proefclubcode').fill(PILOT(info, 'club'));
  await create.locator('input[name=consent]').check();
  await create.getByRole('button', { name: 'Club oprichten' }).click();
  await expect(A.page.locator('#status')).toContainText('Jij bent beheerder');
  await expect(A.page.locator('.club-qr svg')).toBeVisible();
  const code = (await A.page.locator('.club-code').textContent()).trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  await A.page.locator('#challenge select').selectOption('score30');
  await A.page.locator('#challenge').getByRole('button', { name: 'Opslaan' }).click();
  await expect(A.page.locator('#status')).toContainText('Weekoefening opgeslagen');

  // 2. Lid opent de QR-link: code staat al ingevuld, preview toont alleen naam en aantal leden.
  const before = await (async () => { await B.page.goto('/'); return B.page.evaluate(() => localStorage.getItem('oche.data')); })();
  await B.page.goto('/club/#club=' + code);
  await expect(B.page.locator('#preview')).toContainText('DC De Pijl');
  await B.page.locator('#join input[name=consent]').check();
  await B.page.locator('#join').getByRole('button', { name: 'Aanvraag versturen' }).click();
  await expect(B.page.locator('#status')).toContainText('Aanvraag verstuurd');
  await expect(B.page.locator('#vr')).toContainText('wacht op goedkeuring');

  // 3. Beheerder laat toe.
  await A.page.getByRole('tab', { name: /Beheer/ }).click();
  await A.page.getByRole('button', { name: 'Toelaten' }).click();
  await expect(A.page.locator('#status')).toContainText('Lid toegelaten');

  // 4. Lid deelt zijn training (feed + weekoefening als de week nog open is).
  await B.page.reload();
  await B.page.getByRole('button', { name: 'Openen' }).click();
  const row = B.page.locator('form.share-row').first();
  await row.locator('input[name=feed]').check();
  const weekOpen = await row.locator('input[name=challenge]').count() > 0;
  await row.getByRole('button', { name: 'Delen' }).click();
  await expect(B.page.locator('#status')).toContainText('Gedeeld');
  if (weekOpen) await expect(B.page.locator('#panel .board').first()).toContainText('Bas (jij)');
  await B.page.getByRole('tab', { name: 'Feed' }).click();
  await expect(B.page.locator('#panel')).toContainText('Scoretraining 30 pijlen');

  // 5. Verbergen (alleen op dit toestel) en melden (mailvenster, niet versturen).
  await B.page.getByRole('tab', { name: 'Leden' }).click();
  const report = B.page.getByRole('link', { name: 'Melden' }).first();
  await expect(report).toHaveAttribute('href', /^mailto:info@denckh\.nl\?subject=Melding%20OKKIE\.%20Club/);
  await B.page.getByRole('button', { name: 'Verbergen' }).first().click();
  await expect(B.page.locator('#panel')).toContainText('verborgen');

  // 6. Beheerder ziet het lid in de vormranglijst en feed; daarna verlaat het lid de club.
  await A.page.getByRole('tab', { name: 'Feed' }).click();
  await expect(A.page.locator('#panel')).toContainText('Bas');
  await B.page.getByRole('button', { name: 'Club verlaten' }).click();
  await expect(B.page.locator('#status')).toContainText('clubgegevens zijn gewist');
  await A.page.getByRole('tab', { name: 'Feed' }).click();
  await expect(A.page.locator('#panel')).not.toContainText('Bas');

  // Trainingen op de telefoon zijn onaangeroerd.
  expect(await B.page.evaluate(() => localStorage.getItem('oche.data'))).toBe(before);
  expect(A.errors).toEqual([]);
  expect(B.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});

test('clubprofiel en eigen clubtrainingen: naam en logo (alleen leden), doel-oefening maken, insturen en ranglijst', async ({ browser }, info) => {
  const A = await phone(browser, info, seed('Anja'));
  const B = await phone(browser, info, seed('Bas'));
  await A.page.goto('/club/');
  await A.page.getByText('Een club oprichten (proefclub)').click();
  await A.page.locator('#create input[name=name]').fill('Pijl ' + info.project.name);
  await A.page.locator('#create input[name=pilot]').fill(PILOT(info, 'extra'));
  await A.page.locator('#create input[name=consent]').check();
  await A.page.locator('#create button').click();
  await expect(A.page.locator('.club-qr svg')).toBeVisible();
  // Standaardlogo (initialen) zolang er geen logo is.
  await expect(A.page.locator('#club-logo svg')).toHaveAttribute('aria-label', /Standaardlogo/);
  // Naam wijzigen en logo uploaden (wordt vierkant en klein gemaakt).
  await A.page.locator('#profile input[name=name]').fill('DC De Pijl ' + info.project.name);
  await A.page.locator('#profile button').click();
  await expect(A.page.locator('#status')).toContainText('Clubnaam opgeslagen');
  await A.page.locator('#logo-file').setInputFiles('tests/e2e/fixtures/clublogo.png');
  await expect(A.page.locator('#status')).toContainText('Logo opgeslagen');
  await expect(A.page.locator('#club-logo img')).toBeVisible();
  const size = await A.page.locator('.logo-edit img').evaluate(i => [i.naturalWidth, i.naturalHeight]);
  expect(size).toEqual([256, 256]);
  // Te groot of verkeerd bestand: nette melding.
  await A.page.locator('#logo-file').setInputFiles({ name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(A.page.locator('#status')).toContainText('JPG- of PNG');
  const code = (await A.page.locator('.club-code').textContent()).trim();

  // Clubtraining: doel-oefening "30 pijlen op D16" voor de hele club.
  await A.page.getByRole('tab', { name: 'Trainingen' }).click();
  await A.page.getByText('Nieuwe clubtraining').click();
  const f = A.page.locator('#exercise');
  await f.locator('input[name=name]').fill('Dubbel 16');
  await f.locator('textarea[name=description]').fill('Gooi 30 pijlen op dubbel 16 en tel hoeveel er raak zijn.');
  await f.locator('select[name=kind]').selectOption('target');
  await expect(f.locator('input[name=checkouts]')).toBeHidden();
  await f.locator('input[name=target]').fill('D16');
  await f.getByRole('button', { name: 'Clubtraining toevoegen' }).click();
  await expect(A.page.locator('#status')).toContainText('Clubtraining toegevoegd');
  await expect(A.page.locator('.ex-card')).toContainText('30 pijlen op D16');

  // Lid wordt toegelaten, ziet logo en training, en stuurt een resultaat in.
  await B.page.goto('/club/#club=' + code);
  await B.page.locator('#join input[name=consent]').check();
  await B.page.locator('#join button').click();
  await A.page.getByRole('tab', { name: /Beheer/ }).click();
  await A.page.getByRole('button', { name: 'Toelaten' }).click();
  await B.page.reload();
  await B.page.getByRole('button', { name: 'Openen' }).click();
  await expect(B.page.locator('#club-logo img')).toBeVisible();
  await B.page.getByRole('tab', { name: 'Trainingen' }).click();
  await expect(B.page.getByText('Nieuwe clubtraining')).toHaveCount(0);   // lid mag geen trainingen maken
  await B.page.locator('form[data-ex] input[name=hits]').fill('9');
  await B.page.locator('form[data-ex] button').click();
  await expect(B.page.locator('#status')).toContainText('beste resultaat');
  await expect(B.page.locator('.ex-card .board')).toContainText('Bas (jij)');
  await expect(B.page.locator('.ex-card .board')).toContainText('9/30');
  // Melden van clubnaam/logo.
  await B.page.getByRole('tab', { name: 'Leden' }).click();
  await expect(B.page.getByTestId('report-club')).toHaveAttribute('href', /^mailto:info@denckh\.nl\?subject=Melding%20OKKIE\.%20Club%3A%20clubnaam%20of%20logo/);
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
  await A.context.close(); await B.context.close();
});
