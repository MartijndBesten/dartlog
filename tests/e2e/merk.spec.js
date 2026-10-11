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
  // Niet meer vast op Home (rustiger); wel onder Meer en af en toe na een mooi resultaat.
  await expect(page.locator('[data-testid=invite-home]')).toHaveCount(0);
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-testid=invite-card]');
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
  // Duidelijk los van Darters: er worden geen scores gedeeld
  await expect(page.getByTestId('invite-card')).toContainText('er worden geen scores gedeeld');
});

test('Ander appje kiezen gebruikt het deelmenu van de telefoon', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shared = null;
    navigator.share = async d => { window.__shared = d; };
  });
  await onboard(page);
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-testid=invite-card]');
  await page.click('[data-act=invite-share]');
  const shared = await page.evaluate(() => window.__shared);
  expect(shared.url).toBe('https://okkiedarts.nl/');
  expect(shared.text).toContain('OKKIE.');
  await expect(page.locator('#modal')).toBeHidden();
});

// Kleine telefoons en Safari met werkbalken: de toetsen mogen elkaar nooit overlappen (mis-tikken).
for (const vp of [{ width: 320, height: 568 }, { width: 375, height: 548 }]) {
  test(`speelscherm past zonder overlap op ${vp.width} x ${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await onboard(page);
    await page.click('.action.train');
    await page.click('[data-testid=start-score]');
    const box = sel => page.locator(sel).first().boundingBox();
    const row20 = await box('.nums [data-arg="20"]');
    const bull = await box('.specials [data-arg="50"]');
    const stop = await box('[data-act=finish-training]');
    expect(row20.height).toBeGreaterThanOrEqual(34);
    expect(row20.y + row20.height).toBeLessThanOrEqual(bull.y + 0.5);
    expect(bull.y + bull.height).toBeLessThanOrEqual(stop.y + 0.5);
    // en de toetsen werken gewoon
    await page.click('.nums [data-arg="20"]');
    await expect(page.getByTestId('turn-total')).toHaveText('20');
  });
}
