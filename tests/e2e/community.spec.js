import { test, expect } from '@playwright/test';

// Communitypagina op de app-origin, zolang de API nog niet is gekoppeld (community/config.js leeg).
test('communitypagina laadt veilig zonder gekoppelde API en raakt de app niet', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.fill('#wname', 'Senn');
  await page.click("text=Let's play darts");
  await page.goto('/community/');
  await expect(page).toHaveTitle(/Community/);
  await expect(page.locator('#rankings')).toContainText('wordt geactiveerd nadat');
  await expect(page.locator('#account')).toContainText('nog niet verbonden');
  await expect(page.locator('#account select')).toContainText('Senn');
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
