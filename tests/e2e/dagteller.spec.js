import { test, expect } from '@playwright/test';

// Anonieme dagteller (1.7.2): één melding per toestel per dag, nooit blokkerend, niets bij offline of een serverfout.
const seed = page => page.addInitScript(() => {
  localStorage.setItem('okkie.dev', JSON.stringify({ api: 'http://127.0.0.1:8799' }));
  if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify({ version: 2, activePlayerId: 'p1',
    players: [{ id: 'p1', name: 'Sem', color: '#3ddc84' }], trainings: [], matches: [], settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null } }));
});
const remembered = page => page.evaluate(() => JSON.parse(localStorage.getItem('okkie.ping.v1') || 'null'));

test('één melding per dag met alleen versie en first; niet dubbel bij herladen; de app wacht er nooit op', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page);
  const pings = [];
  // De server antwoordt pas na 2,5 s: de app moet intussen gewoon werken.
  await page.route('**/v1/ping', async route => {
    pings.push(route.request().postDataJSON());
    await new Promise(r => setTimeout(r, 2500));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const t0 = Date.now();
  await page.goto('/');
  await expect(page.locator('.action.train')).toBeVisible();
  await page.click('.action.train');
  await expect(page.locator('[data-testid=start-score]')).toBeVisible();
  expect(Date.now() - t0, 'de app wacht niet op de melding').toBeLessThan(2500);
  await expect.poll(() => pings.length).toBe(1);
  expect(pings[0]).toEqual({ version: expect.stringMatching(/^\d+\.\d+\.\d+$/), first: true });
  expect(await remembered(page)).toBeNull();                     // pas onthouden als de server antwoordde
  await page.waitForTimeout(2800);
  expect(await remembered(page)).toEqual({ day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  await page.reload();
  await expect(page.locator('.tabbar')).toBeVisible();
  await page.waitForTimeout(600);
  expect(pings.length, 'zelfde dag: geen tweede melding').toBe(1);
  expect(errors).toEqual([]);
});

test('offline of serverfout: geen fout, niets onthouden, en de app werkt gewoon', async ({ page, context }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page);
  let attempts = 0;
  await page.route('**/v1/ping', route => { attempts++; route.abort('failed'); });
  await page.goto('/');
  await expect(page.locator('.action.train')).toBeVisible();
  await expect.poll(() => attempts).toBe(1);
  await page.waitForTimeout(300);
  expect(await remembered(page)).toBeNull();
  // Serverfout (500): ook niet onthouden, morgen of bij de volgende start opnieuw.
  await page.unroute('**/v1/ping');
  await page.route('**/v1/ping', route => { attempts++; route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }); });
  await page.reload();
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect.poll(() => attempts).toBe(2);
  await page.waitForTimeout(300);
  expect(await remembered(page)).toBeNull();
  // Echt offline: de app start en werkt, zonder melding.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.action.train')).toBeVisible();
  await page.click('.action.train');
  await expect(page.locator('[data-testid=start-score]')).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
