import { test, expect } from '@playwright/test';

// Gesproken aanmoedigingen. De spraak van het toestel wordt nagebootst: zoals Safari blijft een zin na speak() even
// "pending" en daarna kort "speaking"; window.__said houdt bij wat er gezegd werd.
const TAP_GAP = 60;
async function setup(page, settings = {}) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(s => {
    window.__said = [];
    const synth = { speaking: false, pending: false, paused: false,
      getVoices: () => [{ name: 'Xander', lang: 'nl-NL', localService: true }, { name: 'Daniel', lang: 'en-GB', localService: true }],
      speak(u) {
        window.__said.push({ text: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch });
        this.pending = true;
        setTimeout(() => { this.pending = false; this.speaking = true; setTimeout(() => { this.speaking = false; }, 100); }, 20);
      },
      cancel() { this.pending = false; this.speaking = false; }, resume() {}, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify({ version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name: 'Senn', color: '#3ddc84' }],
      trainings: [], matches: [], settings: { theme: 'dark', sound: false, vibrate: false, speech: true, ...s }, active: { training: null, match: null } }));
  }, settings);
  await page.goto('/');
  return errors;
}
const said = page => page.evaluate(() => window.__said.map(x => x.text));
const key = async (page, n) => { await page.locator(`.nums [data-act=key][data-arg="${n}"], .specials [data-act=key][data-arg="${n}"]`).first().click(); await page.waitForTimeout(TAP_GAP); };
async function dart(page, code) {
  if (code === 'M') return key(page, 0);
  if (code === 'DB') return key(page, 50);
  if (code[0] === 'D') await page.click('[data-act=mod][data-arg="2"]');
  if (code[0] === 'T') await page.click('[data-act=mod][data-arg="3"]');
  await key(page, code.slice(1));
}
const throwTurn = async (page, darts) => { for (const c of darts) await dart(page, c); await page.waitForTimeout(150); };

test('180: Engelse call met opbouw, daarna de juich in het Nederlands, sneller en hoger dan normaal', async ({ page }) => {
  const errors = await setup(page, { speechMode: 'rustig' });
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await throwTurn(page, ['T20', 'T20', 'T20']);
  await expect.poll(() => page.evaluate(() => window.__said.length)).toBe(2);
  const [call, cheer] = await page.evaluate(() => window.__said);
  expect(call).toMatchObject({ text: 'One hundred... and eighty!', lang: 'en-GB' });
  expect(call.pitch).toBeGreaterThan(1);
  expect(cheer).toMatchObject({ text: 'Ja! Je eerste honderdtachtig! Ongelooflijk!', lang: 'nl-NL' });
  expect(cheer.rate).toBeGreaterThan(1);
  expect(cheer.pitch).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('"Veel, met grapjes" (standaard): start, grapje bij nul, halverwege, nog één beurt en een afsluiting', async ({ page }) => {
  const errors = await setup(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await expect.poll(() => said(page)).toHaveLength(1);
  expect((await said(page))[0]).toMatch(/Daar gaan we|Gooien maar|focus/);
  await throwTurn(page, ['M', 'M', 'M']);
  expect((await said(page)).at(-1)).toMatch(/Nul|mis|Oeps/);
  for (let i = 2; i <= 4; i++) await throwTurn(page, ['S20', 'S5', 'S5']);
  expect(await said(page)).toHaveLength(2);                          // gewone beurten: stil
  await throwTurn(page, ['S20', 'S5', 'S5']);                        // beurt 5 van 10
  expect((await said(page)).at(-1)).toMatch(/Halverwege|helft/);
  for (let i = 6; i <= 8; i++) await throwTurn(page, ['S20', 'S5', 'S5']);
  await throwTurn(page, ['S20', 'S5', 'S5']);                        // beurt 9
  expect((await said(page)).at(-1)).toMatch(/Nog één beurt|Laatste beurt/);
  await throwTurn(page, ['S20', 'S5', 'S5']);                        // beurt 10: uitslag
  await expect(page.getByTestId('result-avg')).toBeVisible();
  await expect.poll(async () => (await said(page)).at(-1)).toMatch(/record|Klaar/);
  expect(errors).toEqual([]);
});

test('wedstrijd: game on, finish-call, bust met een knipoog en uitgegooid', async ({ page }) => {
  const errors = await setup(page);
  await page.click('.action.match');
  await page.click('[data-act=match-set][data-arg="start:301"]');
  await page.click('[data-testid=start-match]');
  await expect.poll(async () => (await said(page)).at(-1)).toMatch(/Game on/);
  await throwTurn(page, ['T20', 'T20', 'T20']);                      // 121 over (eerste 180: call + juich)
  await throwTurn(page, ['T20', 'S20', 'S1']);                       // 40 over
  expect((await said(page)).at(-1)).toBe('Nog 40. Dubbel 20!');
  await throwTurn(page, ['S20', 'S20']);                             // 0 zonder dubbel: bust
  expect((await said(page)).at(-1)).toMatch(/Bust|overgegooid/);
  await throwTurn(page, ['D20']);
  await expect.poll(async () => (await said(page)).at(-1)).toMatch(/uit|Uitgegooid/i);
  expect(errors).toEqual([]);
});

test('"Alleen hoogtepunten": geen start-, grap- of voortgangszinnen', async ({ page }) => {
  const errors = await setup(page, { speechMode: 'rustig' });
  await page.click('.tabbar [data-go=more]');
  await expect(page.locator('.speech-mode .chip')).toHaveText(['Veel, met grapjes', 'Alleen hoogtepunten']);
  await expect(page.locator('.speech-mode .chip').nth(1)).toHaveClass(/on/);
  await expect(page.getByTestId('speech-note')).toContainText('Alleen bij een persoonlijk record');
  await page.click('.tabbar [data-go=home]');
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await throwTurn(page, ['M', 'M', 'M']);
  for (let i = 2; i <= 5; i++) await throwTurn(page, ['S20', 'S5', 'S5']);
  expect(await said(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('omschakelen in Meer: bewaard in de instellingen, met een korte bevestiging', async ({ page }) => {
  const errors = await setup(page);
  await page.click('.tabbar [data-go=more]');
  const chip = n => page.locator('.speech-mode .chip').nth(n);
  await expect(chip(0)).toHaveClass(/on/);
  const mode = () => page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')).settings.speechMode);
  await chip(1).click();
  await expect(chip(1)).toHaveClass(/on/);
  expect(await mode()).toBe('rustig');
  expect((await said(page)).at(-1)).toMatch(/hoogtepunten/);
  await chip(0).click();
  await expect(chip(0)).toHaveClass(/on/);
  expect(await mode()).toBeUndefined();
  expect((await said(page)).at(-1)).toMatch(/vaker aan/);
  expect(errors).toEqual([]);
});
