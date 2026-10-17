import { test, expect } from '@playwright/test';

// Zelf instelbare statistieken (1.7.0): beste beurt per training, grafiek per beurt, keuzes per speler.
const TAP_GAP = 60;
const key = async (page, n) => {
  await page.locator(`.nums [data-act=key][data-arg="${n}"], .specials [data-act=key][data-arg="${n}"]`).first().click();
  await page.waitForTimeout(TAP_GAP);
};
async function dart(page, code) {
  if (code === 'M') return key(page, 0);
  if (code === 'SB') return key(page, 25);
  if (code === 'DB') return key(page, 50);
  const m = code[0], n = code.slice(1);
  if (m === 'D') await page.click('[data-act=mod][data-arg="2"]');
  if (m === 'T') await page.click('[data-act=mod][data-arg="3"]');
  await key(page, n);
}
async function onboard(page, name = 'Senn') {
  await page.goto('/');
  await page.fill('#wname', name);
  await page.click("text=Let's play darts");
  await expect(page.locator('.hero h2')).toHaveText(name);
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')));
const at = new Date('2026-10-10T18:00:00Z').toISOString();
const turn = (darts, p) => ({ at, darts, ...(p === undefined ? {} : { p }) });
const fill = n => Array.from({ length: n }, (_, i) => ['S20', 'S20', i % 3 ? 'S5' : 'S1']);
// Gegevens klaarzetten zoals de app ze zelf opslaat (zelfde vorm als na echt gooien).
async function seed(page, d) {
  await page.addInitScript(x => { if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(x)); }, {
    version: 2, activePlayerId: d.players[0].id, matches: [], settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null }, trainings: [], ...d,
  });
}
// Met een lopende training opent de app meteen het speelscherm; anders eerst "Verder".
async function resume(page) {
  await page.locator('.nums [data-act=key], [data-act=resume-training]').first().waitFor();
  if (await page.locator('[data-act=resume-training]').count()) await page.click('[data-act=resume-training]');
  await expect(page.locator('.nums [data-act=key]').first()).toBeVisible();
}
const P1 = { id: 'p-senn', name: 'Senn', color: '#3ddc84' }, P2 = { id: 'p-mila', name: 'Mila', color: '#ff5a5f' };
const scores = page => page.locator('[data-testid=turn-chart] .tc-bar').evaluateAll(els => els.map(e => Number(e.dataset.score)));
const best = page => page.locator('[data-testid=turn-chart] .tc-bar.best').evaluateAll(els => els.map(e => Number(e.dataset.n)));

test('na 30 pijlen: alle 10 beurten op volgorde, hoogste beurt met nummer en pijlen, gedeelde hoogste allebei gemarkeerd', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  const turns = [['S20', 'S20', 'S20'], ['S20', 'S20', 'S5'], ['T20', 'S20', 'S20'], ['T20', 'T20', 'S20'], ['S20', 'S5', 'S1'],
    ['T20', 'T20', 'S20'], ['T19', 'S20', 'S1'], ['T19', 'M', 'M'], ['S1', 'S1', 'S1'], ['T20', 'S20', 'S5']];
  for (const t of turns) for (const c of t) await dart(page, c);
  await expect(page.getByTestId('result-avg')).toHaveText('73,40');
  expect(await scores(page)).toEqual([60, 45, 100, 140, 26, 140, 78, 57, 3, 85]);
  expect(await best(page)).toEqual([4, 6]);
  const card = page.getByTestId('best-turn');
  await expect(card.locator('.bt-main strong')).toHaveText('140');
  await expect(card).toContainText('Beurt 4 en 6');
  await expect(card).toContainText('gedeelde hoogste');
  await expect(card.locator('.bt-list li')).toHaveText([/Beurt 4\s*T20\s*T20\s*20/, /Beurt 6\s*T20\s*T20\s*20/]);
  // Tik op een beurt: score en de drie pijlen
  const detail = page.getByTestId('turn-detail');
  await expect(detail).toContainText('Tik op een beurt');
  await page.locator('.tc-bar[data-n="8"]').click();
  await expect(detail).toContainText('Beurt 8');
  await expect(detail.locator('strong')).toHaveText('57');
  await expect(detail.locator('.darts i')).toHaveText(['T19', 'Mis', 'Mis']);
  await expect(page.locator('.tc-bar[data-n="8"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.tc-bar[data-n="4"]').click();
  await expect(detail.locator('.tc-tag.best')).toHaveText('hoogste beurt');
  if (info.project.name === 'desktop') {
    await page.locator('.tc-bar[data-n="4"]').press('ArrowRight');
    await expect(detail).toContainText('Beurt 5');
    await expect(page.locator('.tc-bar[data-n="5"]')).toBeFocused();
  }
  // Alle beurten als lijst, in de juiste volgorde
  await page.locator('.all-turns summary').click();
  await expect(page.locator('.all-turns .turnlist li b')).toHaveText(['60', '45', '100', '140', '26', '140', '78', '57', '3', '85']);
  await expect(page.locator('.all-turns .turnlist li.best')).toHaveCount(2);
  await expect(page.getByTestId('result-tons').locator('strong')).toHaveText(['3', '2', '0']);
  // Gemiddelde-lijn op de juiste hoogte (73,4 van 140)
  expect(await page.locator('.tc-avg').evaluate(e => getComputedStyle(e).getPropertyValue('--r').trim())).toBe('0.524');
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-beurten.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('eerder gestopt: de onvolledige laatste beurt telt niet als hoogste of laagste beurt', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-act=setup-turns][data-arg="0"]');   // vrij trainen
  await page.click('[data-testid=start-score]');
  for (const c of ['S20', 'S20', 'S20', 'T20', 'S20', 'S20', 'S5', 'S5', 'S5', 'T20', 'T20']) await dart(page, c);
  await page.click('[data-act=finish-training]');
  await page.locator('.modal').getByRole('button', { name: 'Bewaren' }).click();
  expect(await scores(page)).toEqual([60, 100, 15, 120]);
  await expect(page.locator('.tc-bar[data-n="4"]')).toHaveClass(/part/);
  expect(await best(page)).toEqual([2]);
  await expect(page.getByTestId('best-turn').locator('.bt-main strong')).toHaveText('100');
  await expect(page.locator('.tc-legend')).toContainText('onvolledig');
  await page.locator('.tc-bar[data-n="4"]').click();
  await expect(page.getByTestId('turn-detail')).toContainText('onvolledig');
  await expect(page.getByTestId('turn-detail').locator('.darts i')).toHaveText(['T20', 'T20']);
  // Laagste beurt aanzetten: 15 (beurt 3), niet de onvolledige
  await page.getByTestId('stat-prefs').click();
  await page.getByTestId('pref-one-low').check();
  await expect(page.getByTestId('result-tiles')).toContainText('Laagste beurt');
  await expect(page.getByTestId('result-tiles').locator('.tile', { hasText: 'Laagste' }).locator('strong')).toHaveText('15');
  await expect(page.getByTestId('result-tiles')).toContainText('Beurt 3');
  const d = await stored(page);
  expect(d.trainings[0].turns.map(t => t.darts.length)).toEqual([3, 3, 3, 2]);
});

test('eigen aantal (7 beurten) en 60 pijlen: juiste aantal beurten, alles in beeld', async ({ page }, info) => {
  test.skip(info.project.name === 'android', 'iPhone en desktop zijn genoeg voor de lengtes');
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-act=setup-turns][data-arg="-1"]');
  await page.locator('[data-input=custom-turns]').fill('7');
  await page.locator('[data-input=custom-turns]').dispatchEvent('change');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 7; i++) for (const c of (i === 3 ? ['T20', 'T20', 'T20'] : ['S20', 'S1', 'S5'])) await dart(page, c);
  await expect(page.locator('.result-hero small')).toContainText('21 pijlen');
  expect(await scores(page)).toEqual([26, 26, 26, 180, 26, 26, 26]);
  expect(await best(page)).toEqual([4]);
  await expect(page.locator('.tchart')).not.toHaveClass(/dense/);
  // 60 pijlen (20 beurten): nog zonder zijwaarts scrollen
  await page.click('.tabbar [data-go=train]');
  await page.click('[data-act=setup-turns][data-arg="20"]');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 20; i++) for (const c of (i === 12 ? ['T20', 'T19', 'S20'] : ['S5', 'S5', 'S5'])) await dart(page, c);
  expect((await scores(page)).length).toBe(20);
  expect(await best(page)).toEqual([13]);
  await expect(page.locator('.tchart')).not.toHaveClass(/dense/);
  expect(await page.locator('.tc-scroll').evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
});

test('99 pijlen op een kleine telefoon: 33 beurten, de grafiek scrolt zelf, de pagina niet', async ({ browser }, info) => {
  test.skip(info.project.name === 'desktop', 'alleen telefoons');
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ userAgent, deviceScaleFactor, isMobile, hasTouch, viewport: { width: 320, height: 640 } });
  const page = await context.newPage();
  const turns = [...fill(31).map(d => turn(d, 0)), turn(['T20', 'T20', 'S20'], 0)];   // 32 beurten, beurt 32 = 140
  await seed(page, { players: [P1], active: { training: { id: 't-99', playerId: P1.id, players: [P1.id], kind: 'score', limitTurns: 33, startedAt: at, turns, pending: [] }, match: null } });
  await page.goto('/');
  await resume(page);
  for (const c of ['T20', 'T20', 'S20']) await dart(page, c);           // beurt 33 = 140: gedeelde hoogste
  await expect(page.locator('.result-hero small')).toContainText('99 pijlen');
  expect((await scores(page)).length).toBe(33);
  expect(await best(page)).toEqual([32, 33]);
  await expect(page.locator('.tchart')).toHaveClass(/dense/);
  expect(await page.locator('.tc-scroll').evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.locator('.tc-bar[data-n="33"]').click();
  await expect(page.getByTestId('turn-detail')).toContainText('Beurt 33');
  await expect(page.getByTestId('turn-detail')).toContainText('van 33');
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-99-pijlen.png`, fullPage: true });
  await context.close();
});

test('Pas mijn statistieken aan: meteen zichtbaar, per speler, bewaard na herladen, standaardweergave herstellen', async ({ page }) => {
  const tr = (id, playerId, n, high) => ({ id, playerId, kind: 'score', limitTurns: n, startedAt: at, finishedAt: at, turns: [...fill(n - 1), high].map(d => turn(d)) });
  await seed(page, { players: [P1, P2], trainings: [tr('t-s', P1.id, 10, ['T20', 'T20', 'T20']), tr('t-m', P2.id, 10, ['T19', 'T19', 'S1'])] });
  await page.goto('/');
  const before = await stored(page);
  await page.click('.tabbar [data-go=stats]');
  // Standaard: alleen het belangrijkste
  const tiles = page.getByTestId('stat-tiles');
  await expect(tiles.locator('.tile.hl strong')).toBeVisible();
  await expect(tiles).not.toContainText('Totaal punten');
  await expect(page.locator('h3', { hasText: 'Trefferkaart' })).toBeVisible();
  await expect(page.getByTestId('stat-turns')).toHaveCount(0);
  // Aanpassen: het scherm erachter verandert meteen
  await page.getByTestId('stat-prefs').click();
  await expect(page.getByTestId('pref-scope-many')).toHaveClass(/on/);
  await expect(page.getByTestId('pref-reset')).toBeDisabled();
  await page.getByTestId('pref-many-heatmap').uncheck();
  await page.getByTestId('pref-many-points').check();
  await page.getByTestId('pref-many-turns').check();
  await expect(page.getByTestId('pref-reset')).toBeEnabled();
  await expect(page.locator('#app h3', { hasText: 'Trefferkaart' })).toHaveCount(0);
  await expect(tiles).toContainText('Totaal punten');
  await expect(page.getByTestId('stat-turns').locator('.tc-bar')).toHaveCount(10);
  await expect(page.getByTestId('stat-turns')).toContainText('hoogste beurt 180');
  // Andere soort in hetzelfde venster
  await page.getByTestId('pref-scope-one').click();
  await expect(page.getByTestId('pref-one-turns')).toBeChecked();
  await expect(page.getByTestId('pref-list').locator('[data-testid=pref-one-trend]')).toHaveCount(0);
  await page.getByTestId('pref-one-tons').uncheck();
  await page.click('[data-act=modal-close]');
  // Bewaard na herladen; trainingen en spelers zijn niet veranderd
  await page.reload();
  await page.click('.tabbar [data-go=stats]');
  await expect(page.locator('#app h3', { hasText: 'Trefferkaart' })).toHaveCount(0);
  const after = await stored(page);
  expect(after.trainings).toEqual(before.trainings);
  expect(after.players).toEqual(before.players);
  expect(after.settings.statView[P1.id].many).not.toContain('heatmap');
  expect(after.settings.statView[P1.id].one).not.toContain('tons');
  expect(after.settings.statView[P2.id]).toBeUndefined();
  // Mila heeft haar eigen (standaard)weergave
  await page.click('[data-act=switch-player]');
  await page.locator('.modal').getByText('Mila').click();
  await page.click('.tabbar [data-go=stats]');
  await expect(page.locator('#app h3', { hasText: 'Trefferkaart' })).toBeVisible();
  await expect(page.getByTestId('stat-turns')).toHaveCount(0);
  // Terug naar Senn: standaardweergave herstellen
  await page.click('[data-act=switch-player]');
  await page.locator('.modal').getByText('Senn').click();
  await page.click('.tabbar [data-go=stats]');
  await page.getByTestId('stat-prefs').click();
  await page.getByTestId('pref-reset').click();
  await expect(page.getByTestId('pref-many-heatmap')).toBeChecked();
  await expect(page.getByTestId('pref-reset')).toBeDisabled();
  await expect(page.locator('#app h3', { hasText: 'Trefferkaart' })).toBeVisible();
  expect((await stored(page)).settings.statView).toBeUndefined();
});

test('na een training aanpassen: grafiek uit, totaal en pijlen aan; alles uit laat toch een nette uitslag zien', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 10; i++) for (const c of ['T20', 'S20', 'S1']) await dart(page, c);
  await expect(page.getByTestId('turn-chart')).toBeVisible();
  await page.getByTestId('stat-prefs').click();
  await expect(page.getByTestId('pref-scope-one')).toHaveClass(/on/);
  await page.getByTestId('pref-one-turns').uncheck();
  await page.getByTestId('pref-one-points').check();
  await page.getByTestId('pref-one-darts').check();
  await expect(page.locator('#app [data-testid=turn-chart]')).toHaveCount(0);
  await expect(page.getByTestId('result-tiles').locator('.tile span')).toHaveText(['Totaal punten', 'Pijlen']);
  await expect(page.getByTestId('result-tiles').locator('strong')).toHaveText(['810', '30']);
  for (const k of ['avg', 'high', 'tons', 'prev', 'records', 'points', 'darts']) await page.getByTestId('pref-one-' + k).uncheck();
  await page.click('[data-act=modal-close]');
  await expect(page.getByTestId('result-darts')).toHaveText('30');
  await expect(page.getByTestId('best-turn')).toHaveCount(0);
  await expect(page.getByTestId('stat-prefs')).toBeVisible();
});

test('training uit een andere app: geen verzonnen beurten, niet in de grafiek', async ({ page }) => {
  await seed(page, { players: [P1], trainings: [{ id: 't-dc', playerId: P1.id, kind: 'score', limitTurns: 10, startedAt: at, turns: [], summary: { points: 650, darts: 30, high: 140 }, source: 'DartCounter' }],
    settings: { theme: 'dark', sound: false, vibrate: false, statView: { [P1.id]: { one: ['avg', 'high', 'turns'], many: ['avg', 'high', 'turns'] } } } });
  await page.goto('/');
  await page.click('.tabbar [data-go=stats]');
  await expect(page.getByTestId('stat-tiles').locator('.tile.hl strong')).toHaveText('65,00');
  await expect(page.getByTestId('stat-turns')).toHaveCount(0);
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-go=history]');
  await page.click('[data-act=open-training]');
  await expect(page.locator('.modal')).toContainText('alleen de eindstand is bekend');
  await expect(page.locator('.modal [data-testid=turn-chart]')).toHaveCount(0);
  await expect(page.locator('.modal .turnlist li')).toHaveCount(0);
});

test('samen trainen: hoogste beurt per speler en de grafiek per speler te kiezen', async ({ page }) => {
  const turns = [];
  for (let i = 0; i < 9; i++) { turns.push(turn(i === 2 ? ['T20', 'T20', 'S20'] : ['S20', 'S20', 'S20'], 0)); turns.push(turn(i === 5 ? ['T19', 'T19', 'T19'] : ['S5', 'S5', 'S5'], 1)); }
  turns.push(turn(['S20', 'S20', 'S20'], 0));
  await seed(page, { players: [P1, P2], active: { training: { id: 't-g', playerId: P1.id, players: [P1.id, P2.id], kind: 'score', limitTurns: 10, startedAt: at, turns, pending: [] }, match: null } });
  await page.goto('/');
  await resume(page);
  for (const c of ['S5', 'S5', 'S5']) await dart(page, c);                 // laatste beurt van Mila
  await expect(page.getByTestId('group-winner')).toHaveText('Senn');
  await expect(page.locator('.ranking li').nth(0)).toContainText('hoogste beurt 140 (beurt 3)');
  await expect(page.locator('.ranking li').nth(1)).toContainText('hoogste beurt 171 (beurt 6)');
  const pick = page.getByTestId('result-pick');
  await expect(pick.locator('.chip.on')).toHaveText('Senn');
  expect(await best(page)).toEqual([3]);
  await pick.getByText('Mila').click();
  await expect(pick.locator('.chip.on')).toHaveText('Mila');
  expect(await scores(page)).toEqual([15, 15, 15, 15, 15, 171, 15, 15, 15, 15]);
  expect(await best(page)).toEqual([6]);
  const d = await stored(page);
  expect(d.trainings.map(t => t.turns.length)).toEqual([10, 10]);
});

test('statistieken: vergelijking met de vorige training van dezelfde soort (30 met 30, niet met 99)', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const tr = (id, n, d, k) => ({ id, playerId: P1.id, kind: 'score', limitTurns: n, startedAt: new Date(Date.parse(at) + k * 864e5).toISOString(), finishedAt: at, turns: Array.from({ length: n }, () => turn(d)) });
  await seed(page, { players: [P1], trainings: [tr('a', 10, ['S20', 'S20', 'S20'], 0), tr('b', 33, ['T20', 'T20', 'T20'], 1), tr('c', 10, ['S20', 'S20', 'S5'], 2)] });
  await page.goto('/');
  await page.click('.tabbar [data-go=stats]');
  await expect(page.getByTestId('stat-compare')).toContainText('Laatste training (30 pijlen): 45,00 · de vorige van 30 pijlen: 60,00');
  await expect(page.getByTestId('stat-compare').locator('.delta.inline')).toHaveText('▼ −15,00');
});

test('dagen op rij: een dag met alleen een wedstrijd breekt de reeks niet; badges eerst verdiend, de rest ingeklapt', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return (n ? d : new Date(Date.now() - 60000)).toISOString(); };
  const training = n => ({ id: 'tr-' + n, playerId: P1.id, kind: 'score', limitTurns: 10, startedAt: daysAgo(n), finishedAt: daysAgo(n),
    turns: fill(10).map(d => ({ at: daysAgo(n), darts: d })) });
  const match = n => ({ id: 'm-' + n, startedAt: daysAgo(n), finishedAt: daysAgo(n), settings: { start: 501, bestOf: 1, doubleOut: true },
    players: [{ id: P1.id, name: P1.name }, { id: P2.id, name: P2.name }],
    legs: [{ starter: 0, turns: [turn(['T20', 'T20', 'T20'], 0), turn(['S1', 'S1', 'S1'], 1), turn(['T20', 'T20', 'T20'], 0), turn(['S1', 'S1', 'S1'], 1), turn(['T20', 'T19', 'D12'], 0)] }] });
  // Vandaag en drie dagen terug getraind, gisteren en eergisteren alleen een wedstrijd: 4 dagen op rij.
  await seed(page, { players: [P1, P2], trainings: [training(3), training(0)], matches: [match(2), match(1)] });
  await page.goto('/');
  await expect(page.locator('.streak')).toHaveText(/4 dagen op rij/);
  await page.click('.tabbar [data-go=stats]');
  const card = page.locator('section.card', { has: page.locator('h3', { hasText: 'Badges' }) });
  await expect(card.locator('.badge-count')).toHaveText(/^\d+\/39$/);
  const earned = card.getByTestId('badges-earned');
  for (const name of ['Eerste pijlen', 'Lekker bezig', 'Uitgegooid!', 'Eerste zege', 'Grote finish', 'Hattrick', 'Drieling']) await expect(earned).toContainText(name);
  const todo = card.locator('details.badges-todo');
  await expect(todo).not.toHaveAttribute('open', '');
  await expect(card.getByTestId('badges-locked')).toBeHidden();
  await todo.locator('summary').click();
  await expect(card.getByTestId('badges-locked')).toContainText('Big Fish');
  expect(errors).toEqual([]);
});
