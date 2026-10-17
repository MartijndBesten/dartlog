import { test, expect } from '@playwright/test';

// De gebouwde website (dist/, zoals straks op okkiedarts.nl), geserveerd op poort 4174 (zie playwright.config.js).
const SITE = 'http://localhost:4174';
const APP = 'https://app.okkiedarts.nl/';
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
  // Leg elke getoonde score vast: de statische HTML staat al op 85 (eindstand zonder JavaScript),
  // dus alleen de reeks waarden bewijst dat de beurt echt wordt afgespeeld.
  // Observeren vanaf het allereerste begin van het document: onder belasting kan de demo al starten
  // voordat DOMContentLoaded valt (daardoor miste de test soms de beginwaarde 0).
  await page.addInitScript(() => {
    window.__scores = [];
    new MutationObserver(records => {
      const el = document.querySelector('[data-demo-total]');
      if (el && records.some(r => el.contains(r.target) || r.target === el)) window.__scores.push(el.textContent);
    }).observe(document, { childList: true, characterData: true, subtree: true });
  });
  await page.goto(SITE + '/');
  const demo = page.locator('[data-demo]');
  const total = page.locator('[data-demo-total]');
  const played = async () => {
    await expect(demo).toHaveClass(/\bdone\b/, { timeout: 8000 });
    const all = (await page.evaluate(() => window.__scores.splice(0))).map(Number);
    // De HTML zelf staat al op 85 (eindstand zonder JavaScript): pas tellen vanaf de start van de beurt.
    const scores = all.slice(Math.max(0, all.indexOf(0)));
    expect(scores[0], 'begint bij 0').toBe(0);
    expect(scores.some(s => s > 0 && s < 85), 'telt zichtbaar op').toBe(true);
    expect(scores.at(-1), 'eindigt op 85').toBe(85);
    expect(scores.every((s, i) => i === 0 || s >= scores[i - 1]), 'telt alleen op: ' + scores.join(' ')).toBe(true);
    await expect(total).toHaveText('85');
    await expect(page.locator('[data-dart].hit')).toHaveCount(3);
    await expect(page.locator('[data-demo-avg]')).toHaveText('57,30');
  };
  await demo.scrollIntoViewIfNeeded();
  await played();
  await demo.click();
  await expect(demo).not.toHaveClass(/\bdone\b/);
  await played();
  await demo.focus();
  await page.keyboard.press('Enter');
  await expect(demo).not.toHaveClass(/\bdone\b/);
  await played();
  // Een demo slaat nooit iets op.
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('homepage: blokken schuiven in en zijn na scrollen allemaal zichtbaar', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  await expect(page.locator('html')).toHaveClass(/\bjs\b/);
  // Onderaan de pagina beginnen de blokken nog verborgen (inschuiven bij scrollen).
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => [...document.querySelectorAll('.reveal, .stagger')]
    .filter(b => b.getBoundingClientRect().top > innerHeight && !b.classList.contains('in')).length)).toBeGreaterThan(0);
  // Scrollen tot helemaal onderaan (de pagina is sinds de blokken Statistieken, Uitdagingen en Stem veel langer).
  for (let y = 0; y < 40 && await page.evaluate(() => scrollY + innerHeight < document.documentElement.scrollHeight - 2); y++) {
    await page.mouse.wheel(0, 700); await page.waitForTimeout(120);
  }
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
  // Contact en privacy: volledig leesbaar, mail-link werkt, geen kopieerknop die zonder script niets doet.
  await page.goto(SITE + '/contact/');
  await expect(page.locator('.contact-mail')).toHaveAttribute('href', 'mailto:info@denckh.nl');
  await expect(page.locator('[data-copy]')).toBeHidden();
  await page.goto(SITE + '/privacy/');
  await expect(page.locator('main h2')).toHaveCount(11); // 'In het kort' + punt 1 t/m 10
  await context.close();
});

test('alle links op website en uitleg wijzen naar de juiste omgeving', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'desktop', 'links zijn per toestel gelijk');
  const allowedExternal = [APP, APP + 'community/', 'https://denckh.nl/', 'https://autoriteitpersoonsgegevens.nl/', 'https://dartswdf.com/rules', 'https://www.thedra.co.uk/dra-rulebook'];
  for (const path of ['/', '/uitleg/', '/privacy/', '/contact/', '/dartregels/']) {
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
      if (href.startsWith('mailto:')) {
        expect(href, `${path}: alleen info@denckh.nl`).toMatch(/^mailto:info@denckh\.nl(\?subject=OKKIE\.)?$/);
        continue;
      }
      // De uitleg draait ook in de app en linkt daarom met het volledige adres naar privacy en contact.
      const url = new URL(href.replace(/^https:\/\/okkiedarts\.nl\//, SITE + '/'), SITE + path);
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
  for (const path of ['/', '/uitleg/', '/privacy/', '/contact/', '/dartregels/']) {
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

test('privacy en contact: bereikbaar vanaf homepage en uitleg, e-mailadres kopiëren', async ({ page, context }, info) => {
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  await page.locator('footer a', { hasText: 'Privacy' }).click();
  await expect(page).toHaveURL(SITE + '/privacy/');
  await expect(page.locator('h1')).toContainText('Jouw pijlen blijven van jou');
  await expect(page.locator('footer a.maker')).toHaveAttribute('href', 'https://denckh.nl/');
  await page.locator('footer a', { hasText: 'Contact' }).click();
  await expect(page).toHaveURL(SITE + '/contact/');
  await expect(page.locator('.contact-mail')).toHaveText('info@denckh.nl');
  // De uitleg linkt met het volledige adres (werkt ook vanuit de app).
  await page.goto(SITE + '/uitleg/');
  await expect(page.locator('.credit a', { hasText: 'Privacy' })).toHaveAttribute('href', 'https://okkiedarts.nl/privacy/');
  await expect(page.locator('.credit a', { hasText: 'Contact' })).toHaveAttribute('href', 'https://okkiedarts.nl/contact/');
  // De kopieerknop geeft altijd zichtbare bevestiging, of een nette uitleg als het klembord geblokkeerd is.
  if (info.project.name === 'desktop') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(SITE + '/contact/');
  await page.locator('[data-copy]').click();
  await expect(page.locator('.copy-status')).toHaveText(/Gekopieerd: info@denckh\.nl|Kopiëren lukt hier niet/);
  if (info.project.name === 'desktop') {
    await expect(page.locator('.copy-status')).toHaveText('Gekopieerd: info@denckh.nl');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('info@denckh.nl');
  }
  expect(errors).toEqual([]);
});

test('gratis en reclamevrij staat op de homepage; nergens een steun- of betaalknop', async ({ page, request }) => {
  await page.goto(SITE + '/');
  await expect(page.locator('.hero .subtle')).toContainText('Geen reclame · Geen aankopen in de app');
  const q = page.locator('details', { hasText: 'Is OKKIE. echt gratis?' });
  await q.locator('summary').click();
  await expect(q).toContainText('geen aankopen in de app');
  await expect(page.locator('footer a', { hasText: 'Steun' })).toHaveCount(0);
  expect((await request.get(SITE + '/steun/')).status()).toBe(404);
});

test('dartregels: vanuit de vraag op de homepage naar de pagina met tekening en maten', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  const q = page.locator('details', { hasText: 'Hoe hang ik een dartbord op?' });
  await q.locator('summary').click();
  await q.getByRole('link', { name: 'Dartregels & afmetingen' }).click();
  await expect(page).toHaveURL(SITE + '/dartregels/');
  await expect(page.locator('h1')).toHaveText('Zo hang je een dartbord op.');
  await expect(page.locator('svg.rules-drawing')).toBeVisible();
  const box = await page.locator('svg.rules-drawing').boundingBox();
  expect(box.width).toBeGreaterThan(260);
  await expect(page.locator('.rules-measures')).toContainText('2,934 m');
  await expect(page.locator('main')).toContainText('Dubbel uitgooien');
  await expect(page.locator('footer a', { hasText: 'Dartregels' })).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('homepage: statistieken, uitdagingen en de stem; tik op een beurt in de voorbeeldgrafiek', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(SITE + '/');
  await expect(page).toHaveTitle('OKKIE. — gratis dart-app vol statistieken en uitdagingen');
  await expect(page.locator('.hero-content .lead-strong')).toHaveText('De gratis dart-app vol statistieken en uitdagingen.');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /vol statistieken en uitdagingen/);
  for (const id of ['statistieken', 'uitdagingen', 'stem']) await expect(page.locator('#' + id + ' h2')).toBeVisible();
  const chart = page.locator('[data-chart]');
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator('.cc-bars button')).toHaveCount(10);
  await expect(chart.locator('.cc-bars button.best')).toHaveCount(2);
  await expect(chart.locator('[data-chart-detail]')).toHaveText('Hoogste beurt: 140 · beurt 4 en 6 · T20 T20 20');
  await chart.locator('.cc-bars button').nth(4).click();
  await expect(chart.locator('[data-chart-detail]')).toHaveText('Beurt 5: 26 · 20 5 1');
  await expect(chart.locator('.cc-bars button').nth(4)).toHaveAttribute('aria-pressed', 'true');
  await chart.locator('.cc-bars button').nth(4).press('ArrowRight');
  await expect(chart.locator('[data-chart-detail]')).toHaveText('Beurt 6: 140 · T20 T20 20 · hoogste beurt');
  await expect(page.locator('#uitdagingen .badge-count')).toHaveText('6/39');
  await expect(page.locator('#uitdagingen .feature-list')).toContainText('39 badges');
  await expect(page.locator('#stem .voice-bubbles li')).toHaveCount(6);
  await expect(page.locator('#vragen summary', { hasText: 'Welke statistieken' })).toHaveCount(1);
  expect(errors).toEqual([]);
});
