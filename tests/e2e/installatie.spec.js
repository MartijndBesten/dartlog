import { test, expect } from '@playwright/test';

// Installatiebegeleiding. Het definitieve adres wordt nagebootst met http://127.0.0.1:4173 + okkie.dev.install.
// Gesimuleerde toestellen: de echte iPhone-stappen (deelknop, Zet op beginscherm) en de Android-prompt
// moeten nog op echte toestellen worden bekeken.
const APP = 'http://127.0.0.1:4173';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const at = d => new Date(Date.UTC(2026, 9, d, 18)).toISOString();
const EXISTING = {
  version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name: 'Senn', color: '#3ddc84', createdAt: at(1) }],
  trainings: [{ id: 't1', playerId: 'p1', kind: 'score', limitTurns: 10, startedAt: at(2), finishedAt: at(2), turns: Array.from({ length: 10 }, () => ({ at: at(2), darts: ['S20', 'S20', 'S20'] })) }],
  matches: [], active: { training: null, match: null }, settings: { theme: 'dark', sound: false, vibrate: false },
};

async function ctxFor(browser, info, { ua, install = true, standalone = false, seed = null } = {}) {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = info.project.use;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent: ua || userAgent });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
  await ctx.addInitScript(([install, standalone, seed]) => {
    localStorage.setItem('okkie.dev', JSON.stringify({ install }));
    if (seed && !localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(seed));
    if (standalone) {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => (/display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
    }
  }, [install, standalone, seed]);
  return ctx;
}
async function welcome(page, name = 'Sem') {
  await page.goto(APP + '/');
  await page.fill('#wname', name);
  await page.click("text=Let's play darts");
}
async function quickTraining(page) {
  await page.click('.action.train');
  await page.click('[data-act=setup-turns][data-arg="0"]');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 3; i++) { await page.click('.nums [data-arg="20"]'); await page.waitForTimeout(60); }
  await page.click('[data-act=finish-training]');
  await page.click('[data-act=modal-ok]');
  await page.click('.tabbar [data-go=home]');
}

test('nieuwe gebruiker: compact advies met "Eerst proberen", één herinnering na de eerste training', async ({ browser }, info) => {
  const ctx = await ctxFor(browser, info);
  const page = await ctx.newPage();
  await welcome(page);
  await expect(page.getByTestId('install-sheet')).toContainText('Zet OKKIE. op je beginscherm');
  await expect(page.getByRole('button', { name: 'OKKIE. installeren' })).toBeVisible();
  await page.getByRole('button', { name: 'Eerst proberen' }).click();
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.getByTestId('install-reminder')).toHaveCount(0);   // nog geen training
  await quickTraining(page);
  await expect(page.getByTestId('install-reminder')).toBeVisible();
  await page.getByTestId('install-reminder').getByRole('button', { name: 'Niet nu' }).click();
  await expect(page.getByTestId('install-reminder')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('install-reminder')).toHaveCount(0);     // weggeklikt blijft weg
  await ctx.close();
});

test('bestaande gebruiker, geïnstalleerde app of oud adres: geen nieuw advies', async ({ browser }, info) => {
  // bestaande gebruiker met trainingen
  let ctx = await ctxFor(browser, info, { seed: EXISTING });
  let page = await ctx.newPage();
  await page.goto(APP + '/');
  await expect(page.locator('.hero h2')).toHaveText('Senn');
  await expect(page.getByTestId('install-reminder')).toHaveCount(0);
  await expect(page.locator('#modal')).toBeHidden();
  await ctx.close();
  // in de geïnstalleerde app: geen advies, wel "Al eerder OKKIE. gebruikt?"
  ctx = await ctxFor(browser, info, { standalone: true });
  page = await ctx.newPage();
  await page.goto(APP + '/');
  await expect(page.getByTestId('fetch-card')).toBeVisible();
  await page.fill('#wname', 'Sem');
  await page.click("text=Let's play darts");
  await expect(page.locator('#modal')).toBeHidden();
  await ctx.close();
  // niet-definitief adres (zoals het oude adres): geen advies
  ctx = await ctxFor(browser, info, { install: false });
  page = await ctx.newPage();
  await welcome(page);
  await expect(page.locator('.hero h2')).toHaveText('Sem');
  await expect(page.locator('#modal')).toBeHidden();
  await ctx.close();
});

test('Android: de echte installatieprompt van de browser', async ({ browser }, info) => {
  const ctx = await ctxFor(browser, info, { ua: ANDROID_CHROME });
  const page = await ctx.newPage();
  await page.goto(APP + '/');
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.fill('#wname', 'Sem');
  await page.click("text=Let's play darts");
  await page.getByRole('button', { name: 'OKKIE. installeren' }).click();
  await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(true);
  await expect(page.locator('#toast')).toContainText('beginscherm');
  expect(await page.evaluate(() => !!JSON.parse(localStorage.getItem('okkie.install.v1')).installedAt)).toBe(true);
  await ctx.close();
});

test('iPhone met trainingen: eerst trainingen meenemen, dan de echte stappen', async ({ browser }, info) => {
  const ctx = await ctxFor(browser, info, { ua: IPHONE_SAFARI });
  const page = await ctx.newPage();
  await welcome(page);
  await page.getByRole('button', { name: 'Eerst proberen' }).click();
  await quickTraining(page);
  await page.getByTestId('install-reminder').getByRole('button', { name: 'Installeren' }).click();
  const steps = page.getByTestId('install-steps');
  await expect(steps).toContainText('Neem eerst je trainingen mee');
  await expect(steps).toContainText('deelknop');
  await expect(steps).toContainText('Zet op beginscherm');
  await expect(steps).toContainText('Voeg toe');
  await expect(steps).toContainText('Trainingen ophalen');
  await page.getByTestId('install-copy').click();
  await expect(page.locator('#toast')).toContainText('gekopieerd');
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code.startsWith('OKKIE-OVERZETTEN-1:')).toBe(true);
  await ctx.close();
});
