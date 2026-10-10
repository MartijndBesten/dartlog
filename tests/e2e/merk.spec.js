import { test, expect } from '@playwright/test';

// Merk en delen: één logo, eigen iconen, geen browser-linkpaars, en een algemene uitnodiging
// die alleen een link naar okkiedarts.nl deelt (los van groepsuitnodigingen in Mijn vrienden).

async function onboard(page, name = 'Sem') {
  await page.goto('/');
  await page.fill('#wname', name);
  await page.click('text=Let\'s play darts');
  await expect(page.locator('.hero h2')).toHaveText(name);
}

// Standaard linkkleuren van browsers (onbezocht blauw, bezocht paars).
const BROWSER_LINK = ['rgb(0, 0, 238)', 'rgb(85, 26, 139)', 'rgb(0, 0, 255)', 'rgb(128, 0, 128)'];
async function noBrowserLinkColors(page, where) {
  const colors = await page.$$eval('a', as => as.filter(a => a.offsetParent).map(a => [a.textContent.trim().slice(0, 30), getComputedStyle(a).color]));
  for (const [text, color] of colors) expect(BROWSER_LINK, `${where}: link "${text}" heeft browserkleur ${color}`).not.toContain(color);
}

test.beforeEach(async ({ page }) => { page.on('pageerror', e => { throw e; }); });

test('logo, iconen en linkkleuren zijn overal OKKIE., zonder horizontaal scrollen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.welcome-logo svg[aria-label="OKKIE."]')).toBeVisible();
  await expect(page.locator('.welcome .maker img.on-dark')).toHaveAttribute('src', './icons/denckh-logo-signature-light.svg');
  await noBrowserLinkColors(page, 'welkom');
  await onboard(page);
  await expect(page.locator('.top-logo svg[aria-label="OKKIE."]')).toBeVisible();
  // Tabbalk: eigen lijniconen in plaats van emoji
  await expect(page.locator('#tabbar svg.ico')).toHaveCount(5);
  expect(await page.locator('#tabbar').innerText()).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
  for (const tab of ['home', 'train', 'match', 'stats', 'more']) {
    await page.click(`.tabbar [data-go=${tab}]`);
    await noBrowserLinkColors(page, tab);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, `${tab}: horizontaal scrollen`).toBeLessThanOrEqual(0);
  }
  // Licht thema: het logo wisselt mee (geen limoen op crème)
  await page.click('[data-act=theme][data-arg=light]');
  const ring = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--logo-ring').trim());
  expect(ring).toBe('#4c9400');
});

test('Nodig een vriend uit: WhatsApp-link met natuurlijke tekst en okkiedarts.nl, kopiëren werkt', async ({ page, context, browserName }, info) => {
  await onboard(page);
  await page.click('[data-testid=invite-home]');
  await expect(page.getByTestId('invite-text')).toContainText('Ik train mijn darts met OKKIE.');
  const href = await page.getByTestId('invite-whatsapp').getAttribute('href');
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  const text = decodeURIComponent(href.split('text=')[1]);
  expect(text).toContain('https://okkiedarts.nl/');
  // Algemene uitnodiging: geen namen, scores of codes
  expect(text).not.toContain('Sem');
  expect(text).not.toMatch(/martijndbesten\.github\.io|app\.okkiedarts\.nl/);
  await expect(page.getByTestId('invite-whatsapp')).toHaveAttribute('target', '_blank');
  // Kopiëren
  if (info.project.name === 'desktop') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('[data-act=invite-copy]');
    await expect(page.locator('#toast')).toContainText('Gekopieerd');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('https://okkiedarts.nl/');
  } else {
    await page.click('[data-act=modal-close]');
  }
  // Ook vanuit Meer, en duidelijk los van Mijn vrienden
  await page.click('.tabbar [data-go=more]');
  await expect(page.getByTestId('invite-card')).toContainText('er worden geen scores gedeeld');
  await page.getByTestId('invite-card').locator('[data-act=invite]').click();
  await expect(page.getByTestId('invite-whatsapp')).toBeVisible();
});

test('Ander appje kiezen gebruikt het deelmenu van de telefoon', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shared = null;
    navigator.share = async d => { window.__shared = d; };
  });
  await onboard(page);
  await page.click('[data-testid=invite-home]');
  await page.click('[data-act=invite-share]');
  const shared = await page.evaluate(() => window.__shared);
  expect(shared.url).toBe('https://okkiedarts.nl/');
  expect(shared.text).toContain('OKKIE.');
  await expect(page.locator('#modal')).toBeHidden();
});
