import { test, expect } from '@playwright/test';

// Aanvullende regressietests: alle trainingslengtes, rond de klok, 301, dezelfde voornaam,
// kleurcontrast (WCAG AA) en verminderde beweging in de app.
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
async function onboard(page, name = 'Sem') {
  await page.goto('/');
  await page.fill('#wname', name);
  await page.click("text=Let's play darts");
  await expect(page.locator('.hero h2')).toHaveText(name);
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')));

test.beforeEach(async ({ page }) => { page.on('pageerror', e => { throw e; }); });

for (const [arg, turns, label] of [['20', 20, '60'], ['33', 33, '99']]) {
  test(`scoretraining ${label} pijlen: precies ${turns} beurten, dan de uitslag`, async ({ page }) => {
    test.setTimeout(120_000);
    await onboard(page);
    await page.click('.action.train');
    await page.click(`[data-act=setup-turns][data-arg="${arg}"]`);
    await expect(page.locator('.choice-info')).toHaveText(`${turns} beurten van 3 pijlen.`);
    await page.click('[data-testid=start-score]');
    for (let i = 0; i < turns * 3; i++) await dart(page, 'S20');
    await expect(page.getByTestId('result-avg')).toHaveText('60,00');
    const d = await stored(page);
    expect(d.trainings[0].limitTurns).toBe(turns);
    expect(d.trainings[0].turns).toHaveLength(turns);
    await page.click('.tabbar [data-go=stats]');
    await page.click(`.chips.scroll [data-arg="statsFilter:${label}"]`);
    await expect(page.locator('.tile.hl strong')).toHaveText('60,00');
  });
}

test('eigen trainingslengte: 5 beurten', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-act=setup-turns][data-arg="-1"]');
  await page.fill('[data-input=custom-turns]', '5');
  await page.locator('[data-input=custom-turns]').dispatchEvent('change');
  await expect(page.locator('.choice-info')).toHaveText('5 beurten van 3 pijlen (15 pijlen).');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 15; i++) await dart(page, i % 3 ? 'S5' : 'T20');
  await expect(page.getByTestId('result-avg')).toHaveText('70,00');
  expect((await stored(page)).trainings[0].turns).toHaveLength(5);
});

test('rond de klok helemaal: 1 t/m 20 en de bull, missers tellen als pijl, record bewaard', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-act=start-clock]');
  await expect(page.getByTestId('clock-target')).toHaveText('1');
  await dart(page, 'M');
  await dart(page, 'D1');                        // dubbel telt ook
  await expect(page.getByTestId('clock-target')).toHaveText('2');
  for (let n = 2; n <= 20; n++) await dart(page, 'S' + n);
  await expect(page.getByTestId('clock-target')).toHaveText('BULL');
  await dart(page, 'SB');
  await expect(page.locator('.result-hero strong')).toHaveText('22');
  const t = (await stored(page)).trainings[0];
  expect(t.kind).toBe('clock');
  expect(t.turns.flatMap(x => x.darts)).toHaveLength(22);
  await page.click('.tabbar [data-go=stats]');
  await expect(page.locator('.records')).toContainText('Snelste rond de klok');
  await expect(page.locator('.records')).toContainText('22 pijlen');
});

test('301 straight out, solo: uitgooien zonder dubbel', async ({ page }) => {
  await onboard(page);
  await page.click('.tabbar [data-go=match]');
  await page.click('[data-arg="start:301"]');
  await page.click('[data-arg="bestOf:1"]');
  await page.click('[data-arg="doubleOut:false"]');
  await page.click('[data-testid=start-match]');
  for (const c of ['T20', 'T20', 'T20']) await dart(page, c);   // 121 over
  await expect(page.getByTestId('rest-0')).toHaveText('121');
  for (const c of ['T20', 'S20', 'S20']) await dart(page, c);   // 21 over
  await expect(page.getByTestId('rest-0')).toHaveText('21');
  await dart(page, 'S20'); await dart(page, 'S1');              // uit
  await expect(page.locator('.result-hero strong')).toHaveText('Sem');
  const m = (await stored(page)).matches[0];
  expect(m.settings).toEqual({ start: 301, bestOf: 1, doubleOut: false });
});

test('dezelfde voornaam: geen tweede speler met precies dezelfde naam; spelers blijven op ID gescheiden', async ({ page }) => {
  await onboard(page, 'Sem');
  await page.click('.tabbar [data-go=more]');
  await page.fill('[data-form=add-player] input', 'sem');
  await page.click('[data-form=add-player] .btn');
  await expect(page.locator('#toast')).toContainText('Die naam bestaat al');
  await page.fill('[data-form=add-player] input', 'Sem B.');
  await page.click('[data-form=add-player] .btn');
  const d = await stored(page);
  expect(d.players.map(p => p.name)).toEqual(['Sem', 'Sem B.']);
  expect(new Set(d.players.map(p => p.id)).size).toBe(2);
  // Bij samen trainen wordt een bestaande naam gekoppeld aan dezelfde speler, niet verdubbeld
  await page.click('.tabbar [data-go=train]');
  await page.fill('[data-form=train-player] input', 'SEM B.');
  await page.click('[data-form=train-player] .btn');
  expect((await stored(page)).players).toHaveLength(2);
  await expect(page.getByTestId('train-players')).toContainText('Sem B.');
});

// WCAG-contrast uit de echte, berekende kleuren van de app (donker en licht thema).
test('kleurcontrast: tekst en knoppen halen WCAG AA in beide thema\'s', async ({ page }) => {
  await onboard(page);
  const ratios = async () => page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const cr = (a, b) => { const [x, y] = [lum(v(a)), lum(v(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    return {
      'tekst/achtergrond': cr('--text', '--bg'), 'tekst/vlak': cr('--text', '--surface'), 'grijs/vlak': cr('--muted', '--surface'), 'grijs/vlak2': cr('--muted', '--surface2'),
      'knoptekst/knop': cr('--primary-ink', '--primary'), 'accent/vlak': cr('--accent', '--surface'), 'rood/toets': cr('--red', '--key'), 'goud/vlak': cr('--gold', '--surface'),
    };
  });
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') { await page.click('.tabbar [data-go=more]'); await page.click('[data-act=theme][data-arg=light]'); }
    for (const [pair, r] of Object.entries(await ratios())) expect(r, `${theme}: ${pair} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('verminderde beweging: animaties in de app staan (vrijwel) stil', async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await onboard(page);
  const dur = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.page')).animationDuration));
  expect(dur).toBeLessThan(0.01);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (const c of ['T20', 'T20', 'T20']) await dart(page, c);
  // de viering verschijnt wel (informatie), maar zonder bewegende animatie
  await expect(page.locator('.celebrate.show .cel-big')).toHaveText('180');
  const anim = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.celebrate.show .cel-inner')).animationDuration));
  expect(anim).toBeLessThan(0.01);
  await ctx.close();
});
