import { test, expect } from '@playwright/test';

// Een lopende training weggooien (1.7.4): Stoppen → Bewaren / Weggooien / Verder trainen. Weggooien bewaart niets en
// raakt niets anders: eerdere trainingen, records, badges, instellingen en Darters blijven precies zoals ze waren.
const TAP_GAP = 60;
const key = async (page, n) => { await page.locator(`.nums [data-act=key][data-arg="${n}"], .specials [data-act=key][data-arg="${n}"]`).first().click(); await page.waitForTimeout(TAP_GAP); };
async function dart(page, code) {
  if (code === 'M') return key(page, 0);
  if (code[0] === 'D') await page.click('[data-act=mod][data-arg="2"]');
  if (code[0] === 'T') await page.click('[data-act=mod][data-arg="3"]');
  await key(page, code.slice(1));
}
const at = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(18, 0, 0, 0); return d.toISOString(); };
const P1 = { id: 'p-senn', name: 'Senn', color: '#3ddc84' }, P2 = { id: 'p-mila', name: 'Mila', color: '#ff5a5f' };
const old = (id, pid, n, darts) => ({ id, playerId: pid, kind: 'score', limitTurns: 10, startedAt: at(n), finishedAt: at(n), turns: Array.from({ length: 10 }, () => ({ at: at(n), darts })) });
// Wat er al was: twee trainingen (record: 10× 100), zodat we kunnen zien dat er niets bijkomt of verandert.
const SEED = { version: 2, activePlayerId: P1.id, players: [P1, P2], matches: [], active: { training: null, match: null },
  settings: { theme: 'dark', sound: false, vibrate: false, speech: true, speechMode: 'rustig' },
  trainings: [old('t1', P1.id, 3, ['T20', 'S20', 'S20']), old('t2', P1.id, 1, ['S20', 'S20', 'S20'])] };
const seed = (page, extra = {}) => page.addInitScript(d => { localStorage.setItem('okkie.ping.v1', JSON.stringify({ day: '2099-01-01' })); if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d)); }, { ...SEED, ...extra });
// Alles behalve de lopende training: moet na weggooien letterlijk gelijk zijn.
// Vaste sleutelvolgorde: de app bewaart dezelfde inhoud soms in een andere volgorde.
const frozen = page => page.evaluate(() => {
  const sort = v => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
  const d = JSON.parse(localStorage.getItem('oche.data')); delete d.active; return JSON.stringify(sort(d));
});
// Sinds 1.8.0 start de app via js/boot.js, net ná het load-event: eerst wachten tot hij draait.
const stats = async page => { await page.waitForFunction(() => !!window.__okkie); return page.evaluate(() => { const d = window.__okkie.data; return { trainings: d.trainings.length, matches: d.matches.length }; }); };
async function discard(page, expectedDarts) {
  await page.click('[data-act=finish-training]');
  const choice = page.locator('.modal');
  await expect(choice.getByRole('button', { name: 'Bewaren' })).toBeVisible();
  await expect(choice.getByRole('button', { name: 'Verder trainen' })).toBeVisible();
  await choice.getByRole('button', { name: 'Weggooien' }).click();
  await expect(page.locator('.modal')).toContainText('Pijlen weggooien?');
  if (expectedDarts) await expect(page.locator('.modal')).toContainText(`De ${expectedDarts} pijlen`);
  await expect(page.locator('.modal')).toContainText('niets bewaard');
  await page.locator('.modal').getByRole('button', { name: 'Weggooien' }).click();
}

test('scoretraining van 30 pijlen weggooien: niets bewaard, records en badges onveranderd, geen synchronisatie', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page);
  const calls = [];
  await page.route('**/v1/**', route => { calls.push(route.request().url()); route.abort('failed'); });
  await page.goto('/');
  const before = await frozen(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (const c of ['T20', 'T20', 'T20', 'S20', 'S20', 'S5', 'T19']) await dart(page, c);   // 180 zou een record én badge zijn
  await discard(page, 7);
  await expect(page.locator('.hero h2')).toHaveText('Senn');                  // terug op Home
  await expect(page.locator('#toast')).toContainText('niets bewaard');
  await expect(page.locator('.resume')).toHaveCount(0);
  expect(await frozen(page)).toBe(before);
  expect(await stats(page)).toEqual({ trainings: 2, matches: 0 });
  await page.click('.tabbar [data-go=stats]');
  await expect(page.locator('.tile.hl strong')).toHaveText('80,00');          // (100+60)/2: alleen de oude trainingen
  await expect(page.locator('section.card', { has: page.locator('h3', { hasText: 'Badges' }) }).getByTestId('badges-earned')).not.toContainText('ONE HUNDRED AND EIGHTY');
  expect(calls.filter(u => !u.includes('/v1/ping'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('Verder trainen gaat terug naar dezelfde beurt; Bewaren werkt nog zoals voorheen', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (const c of ['S20', 'S20']) await dart(page, c);
  await page.click('[data-act=finish-training]');
  await page.locator('.modal').getByRole('button', { name: 'Verder trainen' }).click();
  await expect(page.locator('.modal')).toBeHidden();
  await expect(page.getByTestId('turn-total')).toHaveText('40');
  await dart(page, 'S20');
  await page.click('[data-act=finish-training]');
  await page.locator('.modal').getByRole('button', { name: 'Bewaren' }).click();
  await expect(page.getByTestId('result-avg')).toHaveText('60,00');
  expect(await stats(page)).toEqual({ trainings: 3, matches: 0 });
});

test('vrij trainen en rond de klok weggooien', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const before = await frozen(page);
  await page.click('.action.train');
  await page.click('[data-act=setup-turns][data-arg="0"]');
  await page.click('[data-testid=start-score]');
  for (const c of ['S20', 'S20', 'S20', 'S1']) await dart(page, c);
  await discard(page, 4);
  await expect(page.locator('.hero h2')).toHaveText('Senn');
  await page.click('.action.train');
  await page.getByTestId('start-clock').click();   // 1.10.0: kaart Rond de klok onder Gericht oefenen (keuze: alles)
  await expect(page.locator('.clock-track')).toBeVisible();
  for (const c of ['S1', 'S2', 'M', 'S3', 'S4']) await dart(page, c);
  await discard(page, 5);
  await expect(page.locator('.hero h2')).toHaveText('Senn');
  expect(await frozen(page)).toBe(before);
  expect(await stats(page)).toEqual({ trainings: 2, matches: 0 });
});

test('samen trainen weggooien: geen van de spelers krijgt een training; gepauzeerd stoppen vanaf Home', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const before = await frozen(page);
  await page.click('.action.train');
  await page.click('[data-testid=add-player]');
  await page.click(`.modal [data-act=tp-add][data-arg="${P2.id}"]`);
  await page.click('[data-testid=start-score]');
  for (const c of ['S20', 'S20', 'S20', 'S5', 'S5', 'S5', 'T20']) await dart(page, c);   // Senn 60, Mila 15, Senn bezig
  await page.click('[data-act=pause]');
  await expect(page.locator('.resume')).toContainText('Senn, Mila');
  await page.locator('.resume').getByRole('button', { name: 'Stoppen' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Verder trainen' }).click();
  await expect(page.getByTestId('turn-total')).toHaveText('60');            // de lopende beurt van Senn staat er nog
  await page.click('[data-act=pause]');
  await page.locator('.resume').getByRole('button', { name: 'Stoppen' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Weggooien' }).click();
  await expect(page.locator('.modal')).toContainText('De 7 pijlen');
  await page.locator('.modal').getByRole('button', { name: 'Weggooien' }).click();
  await expect(page.locator('.resume')).toHaveCount(0);
  expect(await frozen(page)).toBe(before);
  await page.reload();
  expect(await stats(page)).toEqual({ trainings: 2, matches: 0 });
  await expect(page.locator('.resume')).toHaveCount(0);
});

test('nog niets gegooid: Stoppen gooit meteen weg zonder vragen; 320 px: de drie keuzes passen onder elkaar', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, viewport: { width: 320, height: 568 } });
  const page = await context.newPage();
  await seed(page);
  await page.goto('/');
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await page.click('[data-act=finish-training]');
  await expect(page.locator('.modal')).toBeHidden();
  await expect(page.locator('.hero h2')).toHaveText('Senn');
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await dart(page, 'S20');
  await page.click('[data-act=finish-training]');
  const boxes = await page.locator('.modal .modal-actions .btn').evaluateAll(els => els.map(e => e.getBoundingClientRect()));
  expect(boxes.length).toBe(3);
  for (const b of boxes) { expect(b.height).toBeGreaterThanOrEqual(40); expect(b.right).toBeLessThanOrEqual(320); }
  expect(boxes[1].top).toBeGreaterThanOrEqual(boxes[0].bottom);
  await context.close();
});
