import { test, expect } from '@playwright/test';

// De gebouwde website (dist/, zoals straks op okkiedarts.nl), geserveerd op poort 4174 (zie playwright.config.js).
const SITE = 'http://localhost:4174';
const APP = 'https://martijndbesten.github.io/dartlog/';
// Alleen de toestelkenmerken (geen browserkeuze) voor een eigen context.
const device = use => ({ viewport: use.viewport, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch });
const REVEALED = () => [...document.querySelectorAll('.reveal, .stagger > *')].filter(e => getComputedStyle(e).opacity !== '1').length;

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

test('homepage: demo-beurt telt op tot 85, tikken en Enter spelen opnieuw af', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  const demo = page.locator('[data-demo]');
  const total = page.locator('[data-demo-total]');
  await demo.scrollIntoViewIfNeeded();
  // Tijdens het afspelen ligt de score tussen 0 en 85, daarna precies 85 met drie raak gegooide pijlen.
  await expect.poll(async () => Number(await total.textContent()), { timeout: 5000 }).toBeGreaterThan(0);
  await expect(total).toHaveText('85', { timeout: 6000 });
  await expect(page.locator('[data-dart].hit')).toHaveCount(3);
  await expect(page.locator('[data-demo-avg]')).toHaveText('57,30');
  await demo.click();
  await expect(total).toHaveText('0');
  await expect(total).toHaveText('85', { timeout: 6000 });
  await demo.focus();
  await page.keyboard.press('Enter');
  await expect(total).toHaveText('0');
  await expect(total).toHaveText('85', { timeout: 6000 });
  expect(errors).toEqual([]);
});

test('homepage: blokken schuiven in en zijn na scrollen allemaal zichtbaar', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  await expect(page.locator('html')).toHaveClass(/\bjs\b/);
  // Onderaan de pagina beginnen de blokken nog verborgen (inschuiven bij scrollen).
  expect(await page.evaluate(REVEALED)).toBeGreaterThan(0);
  for (let y = 0; y < 12; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  await expect.poll(() => page.evaluate(REVEALED), { timeout: 4000 }).toBe(0);
  // Een sprong via een menulink laat ook de overgeslagen blokken zien.
  await page.goto(SITE + '/?sprong#installeren');
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.reveal, .stagger')]
    .filter(b => b.getBoundingClientRect().bottom < 0 && !b.classList.contains('in')).length), { timeout: 4000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('homepage: het eigen toestel wordt uitgelicht bij installeren', async ({ page }, info) => {
  await page.goto(SITE + '/');
  const expected = { iphone: 'ios', android: 'android', desktop: null }[info.project.name];
  if (expected) {
    await expect(page.locator(`[data-device="${expected}"].mine .mine-label`)).toHaveText('Jouw toestel');
    await expect(page.locator('.mine')).toHaveCount(1);
  } else {
    await expect(page.locator('.mine')).toHaveCount(0);
  }
});

test('homepage: met verminderde beweging direct de eindstand, alles zichtbaar', async ({ browser }, info) => {
  const context = await browser.newContext({ ...device(info.project.use), reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  await page.waitForTimeout(300);
  expect(await page.evaluate(REVEALED)).toBe(0);
  await page.locator('[data-demo]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-demo-total]')).toHaveText('85');
  await expect(page.locator('[data-dart].hit')).toHaveCount(3);
  // Tikken verandert niets en start geen animatie.
  await page.locator('[data-demo]').click();
  await expect(page.locator('[data-demo-total]')).toHaveText('85');
  const moving = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length);
  expect(moving).toBe(0);
  // Ook de uitleg staat stil bij verminderde beweging.
  await page.goto(SITE + '/uitleg/');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations === Infinity).length)).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

test('homepage en uitleg werken zonder JavaScript', async ({ browser }, info) => {
  const context = await browser.newContext({ ...device(info.project.use), javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(SITE + '/');
  await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
  // Alle inhoud zichtbaar, demo in eindstand, geen belofte van tik-interactie.
  for (const sel of ['.reveal', '.stagger > *']) {
    for (const el of await page.locator(sel).all()) await expect(el).toHaveCSS('opacity', '1');
  }
  await expect(page.locator('[data-demo-total]')).toHaveText('85');
  await expect(page.locator('.device-note .js-only')).toBeHidden();
  await expect(page.locator('a.nav-cta')).toHaveAttribute('href', APP);
  // De uitleg: de vier stappen zijn leesbaar en de links naar de app werken zonder script.
  await page.goto(SITE + '/uitleg/');
  await expect(page.locator('.step-card')).toHaveCount(4);
  for (const card of await page.locator('.step-card').all()) await expect(card).toBeVisible();
  await expect(page.getByRole('link', { name: /Open de app/ })).toHaveAttribute('href', APP);
  await context.close();
});

test('alle links op website en uitleg wijzen naar de juiste omgeving', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'links zijn per toestel gelijk');
  const allowedExternal = [APP, APP + 'community/'];
  for (const path of ['/', '/uitleg/']) {
    await page.goto(SITE + path);
    const hrefs = await page.locator('a[href], link[href], script[src]').evaluateAll(els =>
      els.map(e => e.getAttribute('href') ?? e.getAttribute('src')));
    expect(hrefs.length).toBeGreaterThan(3);
    for (const href of hrefs) {
      if (href.startsWith('#')) {
        expect(await page.locator(href).count(), `anker ${href} op ${path}`).toBe(1);
        continue;
      }
      expect(href, `${path}: geen relatieve verwijzing buiten de site`).not.toMatch(/^\.\.\//);
      const url = new URL(href, SITE + path);
      if (url.origin === SITE) {
        expect(url.pathname, 'geen app-kopie op okkiedarts.nl').not.toMatch(/^\/(app|community)\b|sw\.js|manifest/);
        expect((await request.get(url.href)).status(), `${href} op ${path} bestaat`).toBe(200);
      } else {
        expect(allowedExternal, `${href} op ${path}`).toContain(url.origin + url.pathname);
      }
    }
  }
  // Er staat bewust geen app op dit domein.
  for (const p of ['/app/', '/sw.js', '/manifest.webmanifest', '/community/', '/js/app.js']) {
    expect((await request.get(SITE + p)).status(), p).toBe(404);
  }
});

test('kleine telefoon (320 px): geen horizontale scroll, knoppen groot genoeg', async ({ browser }, info) => {
  test.skip(info.project.name === 'desktop', 'alleen telefoons');
  const context = await browser.newContext({ ...device(info.project.use), viewport: { width: 320, height: 568 } });
  const page = await context.newPage();
  for (const path of ['/', '/uitleg/']) {
    await page.goto(SITE + path);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(0);
    const small = await page.locator('a.btn, a.button, button').evaluateAll(els => els
      .filter(e => e.offsetParent !== null)
      .map(e => ({ t: e.textContent.trim().slice(0, 30), h: e.getBoundingClientRect().height }))
      .filter(x => x.h < 40));
    expect(small, `${path}: tikdoelen`).toEqual([]);
  }
  await context.close();
});

test('kinderuitleg op de gebouwde site: volledige oefenbeurt zonder opslag', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  await page.locator('.kids-invite a').click();
  await expect(page).toHaveURL(SITE + '/uitleg/');
  await expect(page.locator('.step-card')).toHaveCount(4);
  await page.getByRole('button', { name: /TRIPLE 20/ }).click();
  await page.getByRole('button', { name: /^5 5 punten$/ }).click();
  await page.getByRole('button', { name: /DOUBLE 10/ }).click();
  await expect(page.locator('#demo-total')).toHaveText('85');
  await expect(page.locator('#demo-step')).toHaveText('GOED GEDAAN!');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(errors).toEqual([]);
});
