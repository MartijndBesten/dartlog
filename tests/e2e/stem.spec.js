import { test, expect } from '@playwright/test';

// Gesproken aanmoedigingen: enthousiast (sneller en hoger), 180-call in het Engels en direct daarna een Nederlandse juich.
// De spraak van het toestel wordt nagebootst; zoals Safari blijft een zin even "pending" voordat hij klinkt.
test('180: Engelse call met opbouw, daarna de juich in het Nederlands, sneller en hoger dan normaal', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__said = [];
    const synth = { speaking: false, pending: false, paused: false,
      getVoices: () => [{ name: 'Xander', lang: 'nl-NL', localService: true }, { name: 'Daniel', lang: 'en-GB', localService: true }],
      speak(u) { window.__said.push({ text: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch }); this.pending = true; },
      cancel() { this.pending = false; }, resume() {}, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify({ version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name: 'Senn', color: '#3ddc84' }],
      trainings: [], matches: [], settings: { theme: 'dark', sound: false, vibrate: false, speech: true }, active: { training: null, match: null } }));
  });
  await page.goto('/');
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 3; i++) { await page.click('[data-act=mod][data-arg="3"]'); await page.locator('.nums [data-act=key][data-arg="20"]').click(); await page.waitForTimeout(60); }
  await expect.poll(() => page.evaluate(() => window.__said.length)).toBe(2);
  const [call, cheer] = await page.evaluate(() => window.__said);
  expect(call).toMatchObject({ text: 'One hundred... and eighty!', lang: 'en-GB' });
  expect(call.pitch).toBeGreaterThan(1);
  expect(cheer).toMatchObject({ text: 'Ja! Je eerste honderdtachtig! Ongelooflijk!', lang: 'nl-NL' });
  expect(cheer.rate).toBeGreaterThan(1);
  expect(cheer.pitch).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
